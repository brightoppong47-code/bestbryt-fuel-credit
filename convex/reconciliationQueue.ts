import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwner } from "./helpers";

/** Admin-only dated payment and handover review queue. Read-only. */
export const list = query({
  args: { branchId: v.id("branches"), date: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const day = new Date(args.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== args.date)
      throw new Error("Invalid report date");
    const allPayments = await ctx.db.query("payments").collect();
    const handovers = await ctx.db.query("collection_handovers")
      .withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
    return {
      payments: allPayments.filter(p => p.branchId === args.branchId && p.recordedAt.startsWith(args.date))
        .map(p => ({
          _id: p._id, amountGhs: p.amountGhs, recordedAt: p.recordedAt,
          paymentMethod: p.paymentMethod, externalReference: p.externalReference,
          receiptNumber: p.receiptNumber, reconciliationStatus: p.reconciliationStatus ?? "pending",
        })),
      handovers: handovers.filter(h => h.collectionDate === args.date || (!h.collectionDate && h.recordedAt.startsWith(args.date))),
    };
  },
});
