/**
 * Admin-only destructive operations — data clearing.
 * All mutations in this file require the caller to be an owner.
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOwner } from "./helpers";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";

const correctionTable = v.union(v.literal("drivers"), v.literal("transactions"), v.literal("payments"), v.literal("eod_reports"));
const correctionId = v.union(v.id("drivers"), v.id("transactions"), v.id("payments"), v.id("eod_reports"));
const correctionFields: Record<string, Record<string, string>> = {
  drivers: { fullName:"text", phone:"text", address:"text", vehicleType:"text", vehiclePlate:"text", gpsAddress:"text", witnessName:"text", witnessPhone:"text", notes:"text", isActive:"boolean" },
  transactions: { fuelAmountGhs:"money", interestGhs:"money", interestCollectedUpfront:"boolean", issuedAt:"date", dueAt:"date", notes:"text" },
  payments: { amountGhs:"money", recordedAt:"date", note:"text" },
  eod_reports: { reportDate:"day", customersServed:"count", creditsIssuedCount:"count", creditsIssuedGhs:"money", interestCollectedGhs:"money", paymentsReceivedCount:"count", paymentsReceivedGhs:"money", penaltiesCollectedGhs:"money", notes:"text" },
};
const correctionRound = (n:number) => Math.round(n * 100) / 100;

async function correctionBalance(ctx: MutationCtx, id: Id<"transactions">) {
  const tx = await ctx.db.get(id);
  if (!tx) throw new Error("Credit not found");
  const payments = await ctx.db.query("payments").withIndex("by_transaction", q => q.eq("transactionId", id)).collect();
  const paid = correctionRound(payments.reduce((s,p) => s + p.amountGhs, 0));
  const owed = correctionRound(tx.fuelAmountGhs + (tx.interestCollectedUpfront ? 0 : tx.interestGhs));
  // Preserve the assessed period when amounts change; normal penalty refresh continues.
  const penaltyGhs = tx.totalOwedGhs > 0 ? correctionRound(tx.penaltyGhs * owed / tx.totalOwedGhs) : tx.penaltyGhs;
  const total = correctionRound(owed + penaltyGhs);
  if (paid > total) throw new Error("Correction would make payments exceed the credit balance. Correct payments first.");
  const settled = paid >= total;
  const last = payments.slice().sort((a,b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1);
  await ctx.db.patch(id, { totalOwedGhs: owed, penaltyGhs, amountPaidGhs: paid,
    status: settled ? "paid" : Date.parse(tx.dueAt) < Date.now() ? "overdue" : "pending",
    paidAt: settled ? last?.recordedAt : undefined, paidBy: settled ? last?.recordedBy : undefined });
  // Keep recorded allocations consistent where this schema has allocation fields.
  let previous = 0;
  for (const p of payments.slice().sort((a,b) => a.recordedAt.localeCompare(b.recordedAt) || a._creationTime-b._creationTime || a._id.localeCompare(b._id))) {
    if ("principalGhs" in p) {
      const principalGhs = correctionRound(Math.min(p.amountGhs, Math.max(0, tx.fuelAmountGhs - previous)));
      const interestGhs = correctionRound(Math.min(p.amountGhs-principalGhs, Math.max(0, (tx.interestCollectedUpfront ? 0 : tx.interestGhs)-Math.max(0,previous-tx.fuelAmountGhs))));
      await ctx.db.patch(p._id, { principalGhs, interestGhs, penaltyGhs: correctionRound(p.amountGhs-principalGhs-interestGhs) } as never);
    }
    previous += p.amountGhs;
  }
}

export const listCorrectionEntries = query({
  args: { table: correctionTable, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await ctx.db.query(args.table).order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async record => {
      const data = JSON.stringify(record);
      const driver = "driverId" in record ? await ctx.db.get(record.driverId) : null;
      const branchId = ("branchId" in record ? record.branchId : undefined) ?? driver?.branchId;
      const branch = branchId ? await ctx.db.get(branchId as Id<"branches">) : null;
      const title = "fullName" in record ? record.fullName : driver?.fullName ?? branch?.name ?? "Entry";
      const date = "issuedAt" in record ? record.issuedAt : "recordedAt" in record ? record.recordedAt : "reportDate" in record ? record.reportDate : new Date(record._creationTime).toISOString();
      const linkedPayments = args.table === "transactions" ? (await ctx.db.query("payments").withIndex("by_transaction", q => q.eq("transactionId", record._id as Id<"transactions">)).collect()).length : 0;
      return { id: record._id, data, title, date, branch: branch?.name ?? "", linkedPayments };
    }));
    return { ...result, page };
  },
});

export const correctEntry = mutation({
  args: { table: correctionTable, id: correctionId, expected: v.string(), changes: v.string() },
  handler: async (ctx,args) => {
    await requireOwner(ctx);
    const id = ctx.db.normalizeId(args.table,args.id);
    if (!id) throw new Error("Invalid entry type");
    const record = await ctx.db.get(id);
    if (!record) throw new Error("Entry no longer exists");
    if (JSON.stringify(record) !== args.expected) throw new Error("This entry changed. Close the editor and reopen it before saving.");
    const changes: Record<string,unknown> = JSON.parse(args.changes);
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid changes");
    const patch: Record<string,unknown> = {};
    for (const [key,value] of Object.entries(changes)) {
      const kind = correctionFields[args.table][key];
      if (!kind) throw new Error("This field cannot be edited");
      if (kind === "boolean" && typeof value !== "boolean") throw new Error("Invalid checkbox");
      if ((kind === "money" || kind === "count") && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (kind==="count" && !Number.isInteger(value)))) throw new Error("Enter a valid non-negative amount or count");
      if (["text","date","day"].includes(kind) && typeof value !== "string") throw new Error("Invalid text");
      if (kind === "date") {
        if (!Number.isFinite(Date.parse(value as string))) throw new Error("Enter a valid date and time");
        patch[key] = new Date(value as string).toISOString();
      } else if (kind === "day") {
        const s=value as string;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s) throw new Error("Enter a valid report date");
        patch[key]=s;
      } else patch[key] = kind === "money" ? correctionRound(value as number) : value;
    }
    const merged = { ...record, ...patch } as Record<string,unknown>;
    if (args.table==="drivers" && !String(merged.fullName).trim()) throw new Error("Customer name is required");
    if (args.table==="transactions" && (Number(merged.fuelAmountGhs)<=0 || Date.parse(String(merged.dueAt)) < Date.parse(String(merged.issuedAt)))) throw new Error("Credit must be positive and due after issue date");
    if (args.table==="payments" && Number(merged.amountGhs)<=0) throw new Error("Payment must be greater than zero");
    if (args.table==="eod_reports") {
      const matches=await ctx.db.query("eod_reports").withIndex("by_branch_date",q=>q.eq("branchId",("branchId" in record ? record.branchId : "") as Id<"branches">).eq("reportDate",String(merged.reportDate))).collect();
      if(matches.some(r=>r._id!==id)) throw new Error("An end-of-day report already exists for that branch and date");
    }
    await ctx.db.patch(id,patch as never);
    if(args.table==="transactions") await correctionBalance(ctx,id as Id<"transactions">);
    if(args.table==="payments" && "transactionId" in record) await correctionBalance(ctx,record.transactionId);
    return { saved:true };
  },
});

export const deleteCorrectionEntry = mutation({
  args: { table: correctionTable, id: correctionId, expected:v.string() },
  handler: async(ctx,args) => {
    await requireOwner(ctx);
    const id=ctx.db.normalizeId(args.table,args.id);
    if(!id) throw new Error("Invalid entry type");
    const record=await ctx.db.get(id);
    if(!record) throw new Error("Entry no longer exists");
    if(JSON.stringify(record)!==args.expected) throw new Error("This entry changed. Reopen it before deleting.");
    if(args.table==="drivers") {
      const credits=await ctx.db.query("transactions").withIndex("by_driver",q=>q.eq("driverId",id as Id<"drivers">)).collect();
      const payments=await ctx.db.query("payments").withIndex("by_driver",q=>q.eq("driverId",id as Id<"drivers">)).collect();
      if(credits.length || payments.length) throw new Error("Delete this customer's incorrect credits and payments first, or mark the customer inactive.");
      const logs=await ctx.db.query("message_logs").withIndex("by_driver",q=>q.eq("driverId",id as Id<"drivers">)).collect();
      for(const log of logs) await ctx.db.delete(log._id);
    }
    if(args.table==="transactions") {
      const payments=await ctx.db.query("payments").withIndex("by_transaction",q=>q.eq("transactionId",id as Id<"transactions">)).collect();
      for(const p of payments) await ctx.db.delete(p._id);
      const logs=await ctx.db.query("message_logs").withIndex("by_transaction",q=>q.eq("transactionId",id as Id<"transactions">)).collect();
      for(const log of logs) await ctx.db.delete(log._id);
    }
    await ctx.db.delete(id);
    if(args.table==="payments" && "transactionId" in record) await correctionBalance(ctx,record.transactionId);
    return { deleted:true };
  },
});

/** Count all records in each major table — used to show what will be deleted */
export const getDataSummary = query({
  args: {},
  handler: async (ctx): Promise<{
    transactions: number;
    payments: number;
    drivers: number;
    eodReports: number;
    messageLogs: number;
  }> => {
    await requireOwner(ctx);
    const [transactions, payments, drivers, eodReports, messageLogs] = await Promise.all([
      ctx.db.query("transactions").collect().then((r) => r.length),
      ctx.db.query("payments").collect().then((r) => r.length),
      ctx.db.query("drivers").collect().then((r) => r.length),
      ctx.db.query("eod_reports").collect().then((r) => r.length),
      ctx.db.query("message_logs").collect().then((r) => r.length),
    ]);
    return { transactions, payments, drivers, eodReports, messageLogs };
  },
});

/** Delete all transactions and their linked payments */
export const clearTransactions = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    const txs = await ctx.db.query("transactions").collect();
    const pmts = await ctx.db.query("payments").collect();
    for (const p of pmts) await ctx.db.delete(p._id);
    for (const t of txs) await ctx.db.delete(t._id);
    return { deleted: txs.length + pmts.length };
  },
});

/** Delete all EOD reports */
export const clearEodReports = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    const rows = await ctx.db.query("eod_reports").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});

/** Delete all message logs */
export const clearMessageLogs = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    const rows = await ctx.db.query("message_logs").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length };
  },
});

/**
 * Delete ALL operational data: transactions, payments, EOD reports,
 * message logs, and drivers.
 * Does NOT remove users, branches, or invited_users.
 */
export const clearAllData = mutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    const [txs, pmts, drivers, eod, msgs] = await Promise.all([
      ctx.db.query("transactions").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("drivers").collect(),
      ctx.db.query("eod_reports").collect(),
      ctx.db.query("message_logs").collect(),
    ]);
    for (const r of [...txs, ...pmts, ...drivers, ...eod, ...msgs]) {
      await ctx.db.delete(r._id);
    }
    return { deleted: txs.length + pmts.length + drivers.length + eod.length + msgs.length };
  },
});

/**
 * Delete a single customer (driver) and all their linked transactions,
 * payments, and EOD-report references.
 */
export const deleteDriver = mutation({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    await requireOwner(ctx);

    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // Collect all linked transactions
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
      .collect();

    // Collect all linked payments for those transactions
    let paymentCount = 0;
    for (const tx of txs) {
      const pmts = await ctx.db
        .query("payments")
        .withIndex("by_transaction", (q) => q.eq("transactionId", tx._id))
        .collect();
      for (const p of pmts) {
        await ctx.db.delete(p._id);
        paymentCount++;
      }
      await ctx.db.delete(tx._id);
    }

    // Delete the driver record itself (photo storage stays in Convex storage but is orphaned — acceptable)
    await ctx.db.delete(args.driverId);

    return { deleted: 1 + txs.length + paymentCount };
  },
});
