import { isBranchStaff, canAccessBranch, assertBranchAccess, assertDriverAccess } from "./helpers";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

export const registerDriver = mutation({
  args: {
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
    if (!branch) throw new ConvexError({ message: "Branch not found", code: "NOT_FOUND" });

    // Branch secretaries can only register drivers in their own branch
    if (!canAccessBranch(user, args.branchId)) {
      throw new ConvexError({ message: "You can only register drivers in your assigned branch", code: "FORBIDDEN" });
    }

    // Claim the next sequence number atomically
    const seq = branch.nextSequence;
    await ctx.db.patch(args.branchId, { nextSequence: seq + 1 });

    // Format: BBV-{BRANCHCODE}-{000001}
    const accountNumber = `BBV-${branch.code}-${padSequence(seq)}`;

    return await ctx.db.insert("drivers", {
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
    if (isBranchStaff(user) && (!user.branchId || (args.branchId && args.branchId !== user.branchId))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const branchId = isBranchStaff(user) ? user.branchId : args.branchId;

    let result;
    if (branchId) {
      result = await ctx.db
        .query("drivers")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("drivers")
        .order("desc")
        .paginate(args.paginationOpts);
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
    return { ...driver, photoUrl, branch };
  },
});
