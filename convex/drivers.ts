import { isBranchStaff, assignedBranchIds, canAccessBranch, assertBranchAccess, assertDriverAccess } from "./helpers";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireStaff } from "./helpers";
import { paginationOptsValidator } from "convex/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    return await ctx.storage.generateUploadUrl();
  },
});

/** Pad a number to 6 digits: 1 → "000001" */
function padSequence(n: number): string {
  return String(n).padStart(6, "0");
}

async function nextTradingCode(ctx: MutationCtx) {
    const counter = await ctx.db.query("smart_trading_counters")
      .withIndex("by_key", q => q.eq("key", "driver")).unique();
    const tradingSequence = counter?.nextSequence ?? 1;
    if (counter) await ctx.db.patch(counter._id, { nextSequence: tradingSequence + 1 });
    else await ctx.db.insert("smart_trading_counters", { key: "driver", nextSequence: tradingSequence + 1 });
    return `SMART-${padSequence(tradingSequence)}`;
}
async function queueRequest(ctx: MutationCtx, driverId: Id<"drivers">, tradingCode: string, branchId: Id<"branches">,
  vehicleType: string, requestedAmount: number, createdBy: Id<"users">, routing: {previousRequestId?:Id<"smart_trading_requests">,previousCreditId?:Id<"transactions">,afterDriverPause?:boolean} = {}) {
      await ctx.db.insert("smart_trading_requests", {
        ...routing, driverId, tradingCode, branchId: branchId, vehicleType: vehicleType,
        requestedAmountGhs: Math.round(requestedAmount * 100) / 100,
        createdBy: createdBy, createdAt: new Date().toISOString(),
        deliveryStatus: "queued", nextAttemptAt: Date.now(), attempts: 0,
      });
      const connection = await ctx.db.query("smart_trading_connection").withIndex("by_key", q => q.eq("key", "global")).unique();
      if (connection || (process.env.SMART_TRADING_REQUEST_URL && process.env.SMART_TRADING_BRIDGE_SECRET)) await ctx.scheduler.runAfter(0, internal.smartTrading.deliverRequests, {});
}

export const recordFuelBreak = mutation({
  args: {driverId:v.id("drivers")},
  handler: async(ctx,{driverId})=>{
    const driver=await assertDriverAccess(ctx,await requireStaff(ctx),driverId);
    if(!driver.pausedTradingAt)await ctx.db.patch(driverId,{pausedTradingAt:Date.now()});
  }
});

export const requestFuelAgain = mutation({
  args: {driverId:v.id("drivers"),amount:v.number()},
  handler: async(ctx,{driverId,amount})=>{
    const user=await requireStaff(ctx);
    const driver=await assertDriverAccess(ctx,user,driverId);
    if(!driver.isActive || !Number.isFinite(amount) || amount<=0 || amount>10000000 || Math.abs(amount*100-Math.round(amount*100))>0.000001)
      throw new ConvexError({message:"Choose an active driver and enter a valid fuel amount.",code:"BAD_REQUEST"});
    const latest=await ctx.db.query("smart_trading_requests").withIndex("by_driver",q=>q.eq("driverId",driverId)).order("desc").first();
    if(latest&&!latest.transactionId)throw new ConvexError({message:"This driver already has an open fuel request.",code:"CONFLICT"});
    if(latest?.transactionId){
      const receipts=await ctx.db.query("payments").withIndex("by_transaction",q=>q.eq("transactionId",latest.transactionId!)).collect();
      const principal=receipts.reduce((sum,p)=>sum+(p.reconciliationStatus==="verified"?Math.round((p.principalGhs??0)*100):0),0);
      if(principal<Math.round(latest.requestedAmountGhs*100))throw new ConvexError({message:"Verify the previous principal repayment first.",code:"BAD_REQUEST"});
    }
    const code=driver.smartTradingCode??await nextTradingCode(ctx);
    if(!driver.smartTradingCode)await ctx.db.patch(driverId,{smartTradingCode:code});
    const previousCreditId=latest?.transactionId??(await ctx.db.query("transactions").withIndex("by_driver",q=>q.eq("driverId",driverId)).order("desc").first())?._id;
    await queueRequest(ctx,driverId,code,driver.branchId,driver.vehicleType,amount,user._id,{
      previousRequestId:latest?._id,previousCreditId,afterDriverPause:Boolean(driver.pausedTradingAt)
    });
    if(driver.pausedTradingAt)await ctx.db.patch(driverId,{pausedTradingAt:undefined});
  }
});

export const registerDriver = mutation({
  args: {
    requestedFuelAmountGhs: v.optional(v.number()),
    fullName: v.string(),
    phone: v.string(),
    address: v.string(),
    vehicleType: v.string(),
    vehiclePlate: v.string(),
    branchId: v.id("branches"),
    gpsLatitude: v.number(),
    gpsLongitude: v.number(),
    gpsAddress: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    witnessName: v.optional(v.string()),
    witnessPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    const branch = await ctx.db.get(args.branchId);
    if (!branch?.isActive) throw new ConvexError({ message: "Branch not found", code: "NOT_FOUND" });

    // Branch secretaries can only register drivers in their own branch
    if (!canAccessBranch(user, args.branchId)) {
      throw new ConvexError({ message: "You can only register drivers in your assigned branch", code: "FORBIDDEN" });
    }

    // Optional only for compatibility with older app versions. The new form requires it.
    const requestedAmount = args.requestedFuelAmountGhs;
    if (requestedAmount !== undefined && (!Number.isFinite(requestedAmount) ||
        requestedAmount <= 0 || !Number.isSafeInteger(Math.round(requestedAmount * 100)) ||
        Math.abs(requestedAmount * 100 - Math.round(requestedAmount * 100)) > 0.000001)) {
      throw new ConvexError({ message: "Enter a positive fuel request amount with at most two decimal places", code: "BAD_REQUEST" });
    }

    // Claim the next sequence number atomically
    const seq = branch.nextSequence;
    await ctx.db.patch(args.branchId, { nextSequence: seq + 1 });

    // Format: BBV-{BRANCHCODE}-{000001}
    const accountNumber = `BBV-${branch.code}-${padSequence(seq)}`;

    const tradingCode = await nextTradingCode(ctx);
    const driverId = await ctx.db.insert("drivers", {
      smartTradingCode: tradingCode,
      fullName: args.fullName,
      phone: args.phone,
      address: args.address,
      vehicleType: args.vehicleType,
      vehiclePlate: args.vehiclePlate,
      branchId: args.branchId,
      gpsLatitude: args.gpsLatitude,
      gpsLongitude: args.gpsLongitude,
      gpsAddress: args.gpsAddress,
      photoStorageId: args.photoStorageId,
      witnessName: args.witnessName,
      witnessPhone: args.witnessPhone,
      notes: args.notes,
      accountNumber,
      sequenceNumber: seq,
      isActive: true,
      registeredBy: user._id,
    });
    if (requestedAmount !== undefined) {
      await queueRequest(ctx,driverId,tradingCode,args.branchId,args.vehicleType,requestedAmount,user._id);
    }
    return driverId;
  },
});

export const updateDriver = mutation({
  args: {
    driverId: v.id("drivers"),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    gpsLatitude: v.optional(v.number()),
    gpsLongitude: v.optional(v.number()),
    gpsAddress: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    witnessName: v.optional(v.string()),
    witnessPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertDriverAccess(ctx, user, args.driverId);
    const { driverId, ...updates } = args;
    if (updates.branchId) assertBranchAccess(user, updates.branchId);
    // Validate branch if changing
    if (updates.branchId) {
      const branch = await ctx.db.get(updates.branchId);
      if (!branch) throw new ConvexError({ message: "Branch not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(driverId, updates);
  },
});

export const listDrivers = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    // Branch secretaries only see drivers in their assigned branch
    if (isBranchStaff(user) && (!assignedBranchIds(user).length || (args.branchId && !canAccessBranch(user,args.branchId)))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const branchId = args.branchId ?? (isBranchStaff(user) && assignedBranchIds(user).length === 1 ? assignedBranchIds(user)[0] : undefined);

    let result;
    if (branchId) {
      result = await ctx.db
        .query("drivers")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      let query = ctx.db.query("drivers");
      // Zone membership must be applied before pagination.
      if (isBranchStaff(user)) query = query.filter(q => q.or(...assignedBranchIds(user).map(id => q.eq(q.field("branchId"), id))));
      result = await query.order("desc").paginate(args.paginationOpts);
    }

    const filtered = args.search
      ? result.page.filter((d) => {
          const q = args.search!.toLowerCase();
          return (
            d.fullName.toLowerCase().includes(q) ||
            d.phone.includes(q) ||
            d.accountNumber.toLowerCase().includes(q) ||
            d.vehiclePlate.toLowerCase().includes(q)
          );
        })
      : result.page;
    return { ...result, page: filtered };
  },
});

export const getDriver = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const driver = await ctx.db.get(args.driverId);
    if (driver && !canAccessBranch(user, driver.branchId)) return null;
    if (!driver) return null;
    const photoUrl = driver.photoStorageId
      ? await ctx.storage.getUrl(driver.photoStorageId)
      : null;
    const branch = await ctx.db.get(driver.branchId);
    const tradingRequest = await ctx.db.query("smart_trading_requests")
      .withIndex("by_driver", q => q.eq("driverId", driver._id)).order("desc").first();
    return { ...driver, photoUrl, branch, tradingRequest };
  },
});
