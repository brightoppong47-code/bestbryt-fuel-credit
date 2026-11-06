import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner } from "./helpers";
import { adjustedBalance } from "./lib/adjustedBalance";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Owner-only adjustment ledger. The main balance calculators must be updated
 * before this mutation is enabled in the UI or deployed.
 */
export const adjust = mutation({
  args: {
    transactionId: v.id("transactions"),
    component: v.union(v.literal("principal"), v.literal("interest"), v.literal("penalty")),
    deltaGhs: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ code: "NOT_FOUND", message: "Transaction not found" });
    if (tx.status === "paid") throw new ConvexError({ code: "CONFLICT", message: "Paid transactions require a separate correction workflow" });
    if (!Number.isFinite(args.deltaGhs) || Math.abs(args.deltaGhs * 100 - Math.round(args.deltaGhs * 100)) > 1e-7 || Math.abs(args.deltaGhs) > 1000000 || args.deltaGhs === 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Enter a nonzero adjustment in whole pesewas" });
    }
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 500) throw new ConvexError({ code: "BAD_REQUEST", message: "Reason must be 10 to 500 characters" });

    const field = args.component === "principal" ? "principalAdjustmentGhs" : args.component === "interest" ? "interestAdjustmentGhs" : "penaltyAdjustmentGhs";
    const old = tx[field] ?? 0;
    const next = round(old + args.deltaGhs);
    const proposed = { ...tx, [field]: next };
    const balance = adjustedBalance(proposed, new Date());
    if (!balance.valid) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Adjustment would create a negative charge or reduce the debt below recorded payments" });
    }

    await ctx.db.patch(tx._id, { [field]: next });
    await ctx.db.insert("transaction_adjustments", {
      transactionId: tx._id, driverId: tx.driverId, component: args.component,
      deltaGhs: round(args.deltaGhs), previousAdjustmentTotalGhs: old,
      newAdjustmentTotalGhs: next, reason, actorId: owner._id,
      createdAt: new Date().toISOString(),
    });
    return { newAdjustmentTotalGhs: next };
  },
});

export const history = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    return await ctx.db.query("transaction_adjustments")
      .withIndex("by_transaction", q => q.eq("transactionId", args.transactionId))
      .order("desc").collect();
  },
});

/** Owner-only review queue for older penalty pauses lacking a start timestamp.
 * Read-only: does not resume penalties or change any financial record.
 */
export const legacyPauseReview = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const now = new Date();
    const transactions = await ctx.db.query("transactions").collect();
    return transactions
      .filter(tx => tx.status !== "paid" && !!tx.penaltyPausedUntil && !tx.penaltyPausedAt)
      .map(tx => ({
        transactionId: tx._id,
        driverId: tx.driverId,
        recordedPenaltyGhs: tx.penaltyGhs,
        amountPaidGhs: tx.amountPaidGhs ?? 0,
        pauseUntil: tx.penaltyPausedUntil!,
        expired: new Date(tx.penaltyPausedUntil!).getTime() <= now.getTime(),
        reviewRequired: true,
      }));
  },
});
