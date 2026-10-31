import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertBranchAccess, requireOwner, requireStaff } from "./helpers";

const money = (n: number) => Math.round(n * 100) / 100;
function positiveAmount(n: number) {
  if (!Number.isFinite(n) || n <= 0 || money(n) <= 0 || Math.abs(n - money(n)) > 0.000001)
    throw new ConvexError({ code: "BAD_REQUEST", message: "Enter a positive amount with at most two decimal places" });
  return money(n);
}
function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new ConvexError({ code: "BAD_REQUEST", message: "Enter a valid closing date (YYYY-MM-DD)" });
}

/** Staff records money transferred to the business; this never changes customer balances. */
export const recordHandover = mutation({
  args: {
    branchId: v.id("branches"),
    amountGhs: v.number(),
    collectionDate: v.string(),
    method: v.union(v.literal("cash"), v.literal("company_momo")),
    externalReference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    if (!["owner", "staff", "branch_secretary"].includes(user.role)) throw new ConvexError({ code: "FORBIDDEN", message: "Only collection staff may record handovers" });
    assertBranchAccess(user, args.branchId);
    const branch = await ctx.db.get("branches", args.branchId);
    if (!branch?.isActive) throw new ConvexError({ code: "BAD_REQUEST", message: "Choose an active branch" });
    const amountGhs = positiveAmount(args.amountGhs);
    validDate(args.collectionDate);
    if (args.collectionDate > new Date().toISOString().slice(0, 10)) throw new ConvexError({ code: "BAD_REQUEST", message: "Collection date cannot be in the future" });
    if (args.method === "company_momo" && !args.externalReference?.trim())
      throw new ConvexError({ code: "BAD_REQUEST", message: "Enter the MoMo transfer reference" });
    return await ctx.db.insert("collection_handovers", {
      branchId: args.branchId,
      staffId: user._id,
      amountGhs,
      collectionDate: args.collectionDate,
      method: args.method,
      externalReference: args.externalReference?.trim(),
      note: args.note?.trim(),
      recordedAt: new Date().toISOString(),
      recordedBy: user._id,
      status: "pending",
    });
  },
});

/** Owner independently verifies money actually received, never creating another customer payment. */
export const reviewHandover = mutation({
  args: {
    handoverId: v.id("collection_handovers"),
    decision: v.union(v.literal("verified"), v.literal("disputed")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const handover = await ctx.db.get("collection_handovers", args.handoverId);
    if (!handover) throw new ConvexError({ code: "NOT_FOUND", message: "Handover not found" });
    if (handover.status !== "pending") throw new ConvexError({ code: "CONFLICT", message: "Already reviewed; create a separate correction" });
    if (!args.note.trim()) throw new ConvexError({ code: "BAD_REQUEST", message: "Enter the verification evidence or discrepancy" });
    const now = new Date().toISOString();
    await ctx.db.patch("collection_handovers", args.handoverId, { status: args.decision, verifiedBy: owner._id, verifiedAt: now });
    await ctx.db.insert("collection_reconciliation_events", {
      branchId: handover.branchId, handoverId: args.handoverId,
      action: args.decision === "verified" ? "verify" : "dispute",
      note: args.note.trim(), actorId: owner._id, occurredAt: now,
    });
  },
});

/** Owner-only reconciliation of existing customer payment records. Legacy payments remain unknown until reviewed. */
export const reviewPayment = mutation({
  args: {
    paymentId: v.id("payments"),
    decision: v.union(v.literal("verified"), v.literal("disputed")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment) throw new ConvexError({ code: "NOT_FOUND", message: "Payment not found" });
    if (payment.reconciliationStatus && payment.reconciliationStatus !== "pending")
      throw new ConvexError({ code: "CONFLICT", message: "Already reviewed; use a separate correction" });
    if (!args.note.trim()) throw new ConvexError({ code: "BAD_REQUEST", message: "Enter the supporting evidence or discrepancy" });
    const driver = await ctx.db.get("drivers", payment.driverId);
    if (!driver) throw new ConvexError({ code: "NOT_FOUND", message: "Customer not found" });
    const now = new Date().toISOString();
    await ctx.db.patch("payments", args.paymentId, { reconciliationStatus: args.decision, reconciledBy: owner._id, reconciledAt: now });
    await ctx.db.insert("collection_reconciliation_events", {
      branchId: payment.branchId ?? driver.branchId, paymentId: args.paymentId,
      action: args.decision === "verified" ? "verify" : "dispute",
      note: args.note.trim(), actorId: owner._id, occurredAt: now,
    });
  },
});

/** Daily branch summary; legacy payments are unclassified, not assumed cash. */
export const dailyCollections = query({
  args: { branchId: v.id("branches"), date: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    assertBranchAccess(user, args.branchId);
    validDate(args.date);
    const payments = await ctx.db.query("payments").collect();
    const branchHandovers = await ctx.db.query("collection_handovers").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();

const handovers = user.role === "owner"
  ? branchHandovers
  : branchHandovers.filter(h => h.staffId === user._id);
    const date = (s: string) => s.slice(0, 10) === args.date;
    const rows = payments.filter(p => p.branchId === args.branchId && date(p.recordedAt));
    const handoverRows = handovers.filter(h => h.collectionDate === args.date);
    const unallocatedLegacyHandovers = handovers.filter(h => !h.collectionDate && date(h.recordedAt));
    const total = (items: {amountGhs: number}[]) => money(items.reduce((sum, p) => sum + p.amountGhs, 0));
    const cash = rows.filter(p => p.paymentMethod === "cash");
    const staffMomo = rows.filter(p => p.paymentMethod === "staff_momo");
    const companyMomo = rows.filter(p => p.paymentMethod === "company_momo");
    const legacy = rows.filter(p => !p.paymentMethod);
    const staffHeld = total([...cash, ...staffMomo]);
    const verifiedHandover = total(handoverRows.filter(h => h.status === "verified"));
    return {
      date: args.date, branchId: args.branchId,
      paymentsGhs: total(rows),
      cashGhs: total(cash), staffMomoGhs: total(staffMomo), companyMomoGhs: total(companyMomo),
      legacyUnclassifiedGhs: total(legacy),
      staffHeldGhs: staffHeld, verifiedHandoverGhs: verifiedHandover,
      unallocatedLegacyHandovers: unallocatedLegacyHandovers.length,
      // Handovers may settle collections from earlier dates. Never subtract same-day handovers from same-day receipts as an outstanding balance.
      handoverBalanceRequiresAllocation: true,
      handovers: handoverRows,
      pendingPayments: rows.filter(p => !p.reconciliationStatus || p.reconciliationStatus === "pending").length,
    };
  },
});
