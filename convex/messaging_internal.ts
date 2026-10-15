import { v } from "convex/values";
import { internalQuery, internalMutation, query } from "./_generated/server";
import { requireStaff, assertTransactionAccess, requireOwner } from "./helpers.ts";

// ─── Internal query: get transaction data for composing a message ─────────────

export const getTransactionForMessage = internalQuery({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get("transactions", args.transactionId);
    if (!tx) return null;
    const driver = await ctx.db.get("drivers", tx.driverId);
    if (!driver) return null;

    const now = new Date();
    const due = new Date(tx.dueAt);
    const isOverdue = now > due;
    const overdueDays = isOverdue
      ? Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const amountPaid = tx.amountPaidGhs ?? 0;
    const totalOwed = Math.max(0, tx.totalOwedGhs + tx.penaltyGhs - amountPaid);

    return {
      driverId: tx.driverId,
      driverName: driver.fullName,
      accountNumber: driver.accountNumber,
      phone: driver.phone,
      totalOwed,
      remaining: totalOwed,
      overdueDays,
    };
  },
});

// ─── Internal query: get drivers for broadcast ────────────────────────────────

export const getActiveDriversForBroadcast = internalQuery({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    if (args.branchId) {
      const all = await ctx.db
        .query("drivers")
        .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
        .collect();
      return all.filter((d) => d.isActive);
    }
    return (await ctx.db.query("drivers").collect()).filter((d) => d.isActive);
  },
});

// ─── Internal mutation: log a sent message ────────────────────────────────────

export const logMessage = internalMutation({
  args: {
    transactionId: v.optional(v.id("transactions")),
    driverId: v.id("drivers"),
    phone: v.string(),
    channel: v.union(v.literal("sms"), v.literal("whatsapp")),
    messageType: v.union(
      v.literal("balance_due"),
      v.literal("payment_received"),
      v.literal("overdue_notice"),
      v.literal("broadcast"),
    ),
    body: v.string(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("message_logs", {
      ...args,
      sentAt: new Date().toISOString(),
    });
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

/** Get last few messages sent for a transaction (for the detail page) */
export const getMessageLogs = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    return await ctx.db
      .query("message_logs")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .order("desc")
      .take(10);
  },
});

/** Get recent broadcast/alert logs for the admin messages page */
export const getRecentLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return await ctx.db
      .query("message_logs")
      .order("desc")
      .take(100);
  },
});
