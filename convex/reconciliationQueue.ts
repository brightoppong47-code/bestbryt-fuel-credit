import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireFinance } from "./helpers";

/** Admin-only dated payment and handover review queue. Read-only. */
export const list = query({
  args: { branchId: v.id("branches"), date: v.string() },
  handler: async (ctx, args) => {
    await requireFinance(ctx);
    const day = new Date(args.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== args.date)
      throw new Error("Invalid report date");
    const allPayments = await ctx.db.query("payments").collect();
    const handovers = await ctx.db.query("collection_handovers")
      .withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
    const events = await ctx.db.query("collection_reconciliation_events").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();
    const users = new Map((await ctx.db.query("users").collect()).map(u=>[u._id,u]));
    const audit = (id: string, kind: "payment"|"handover", fallbackId?: import("./_generated/dataModel").Id<"users">, fallbackAt?: string) => {
      const e = events.filter(e=>(kind === "payment" ? e.paymentId : e.handoverId)===id).sort((a,b)=>b._creationTime-a._creationTime)[0];
      const actor = e ? users.get(e.actorId) : fallbackId ? users.get(fallbackId) : undefined;
      return {reviewerName:e?.actorName ?? actor?.name ?? actor?.email ?? "Legacy reviewer not recorded", reviewerEmail:e?.actorEmail ?? actor?.email, reviewerRole:e?.actorRole ?? actor?.role, reviewedAt:e?.occurredAt ?? fallbackAt, reviewNote:e?.note};
    };
    return {
      payments: allPayments.filter(p => p.branchId === args.branchId && p.recordedAt.startsWith(args.date))
        .map(p => ({
          _id: p._id, ...audit(p._id,"payment",p.reconciledBy,p.reconciledAt), amountGhs: p.amountGhs, recordedAt: p.recordedAt,
          paymentMethod: p.paymentMethod, externalReference: p.externalReference,
          receiptNumber: p.receiptNumber, reconciliationStatus: p.reconciliationStatus ?? "pending",
        })),
      handovers: handovers.filter(h => h.collectionDate === args.date || (!h.collectionDate && h.recordedAt.startsWith(args.date))).map(h=>({...h,...audit(h._id,"handover",h.verifiedBy,h.verifiedAt)})),
    };
  },
});
