/**
 * Admin-only destructive operations — data clearing.
 * All mutations in this file require the caller to be an owner.
 */
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireOwner } from "./helpers";

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
