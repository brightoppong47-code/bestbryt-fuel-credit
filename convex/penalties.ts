import { internalMutation } from "./_generated/server";

const PENALTY_RATE = 0.05;

/** Calculate how many full days overdue a transaction is (0 if not overdue) */
function overdueDays(dueAt: string, now: Date): number {
  const due = new Date(dueAt);
  if (now <= due) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Scans all open (pending/overdue) transactions and recalculates their
 * status and penalty amount. Processes in bounded batches to stay within
 * Convex mutation write limits.
 */
export const updatePenaltiesAndStatuses = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ updated: number }> => {
    const now = new Date();

    // Collect all open transactions (both pending and overdue)
    const pending = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(500);

    const overdue = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .take(500);

    const open = [...pending, ...overdue];
    let updated = 0;

    for (const tx of open) {
      // Skip transactions where penalty is currently paused
      if (tx.penaltyPausedUntil && new Date(tx.penaltyPausedUntil) > now) {
        continue;
      }

      const days = overdueDays(tx.dueAt, now);
      const newStatus: "pending" | "overdue" = days > 0 ? "overdue" : "pending";
      const newPenalty =
        days > 0
          ? Math.round(tx.totalOwedGhs * PENALTY_RATE * days * 100) / 100
          : 0;

      // Only write if something has actually changed
      if (tx.status !== newStatus || tx.penaltyGhs !== newPenalty) {
        await ctx.db.patch(tx._id, {
          status: newStatus,
          penaltyGhs: newPenalty,
          lastPenaltyCalculatedAt: now.toISOString(),
        });
        updated++;
      }
    }

    return { updated };
  },
});
