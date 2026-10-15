import { isBranchStaff, assertDriverAccess, assertTransactionAccess, accessibleDriverIds } from "./helpers";
import { penaltyDays } from "./lib/penaltyDays";
import { allocatePayment } from "./lib/paymentAllocation";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireStaff, requireRiskManagerOrOwner } from "./helpers";
import { paginationOptsValidator } from "convex/server";

import { readInterestRatePercent } from "./appSettings";
const PENALTY_RATE = 0.05;
const DUE_HOURS = 24;

/** Add hours to an ISO string */
function addHours(isoString: string, hours: number): string {
  return new Date(new Date(isoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

/** Calculate how many full days overdue a transaction is (0 if not overdue) */
function overdueDays(dueAt: string, now: Date): number {
  const due = new Date(dueAt);
  if (now <= due) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

export const issueCredit = mutation({
  args: {
    driverId: v.id("drivers"),
    fuelAmountGhs: v.number(),
    interestCollectedUpfront: v.optional(v.boolean()),
    expectedInterestRatePercent: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    if (args.fuelAmountGhs <= 0) {
      throw new ConvexError({ message: "Amount must be greater than 0", code: "BAD_REQUEST" });
    }

    const driver = await assertDriverAccess(ctx, user, args.driverId);
    if (!driver || !driver.isActive) {
      throw new ConvexError({ message: "Driver not found or inactive", code: "NOT_FOUND" });
    }

    // Branch secretaries can only issue credits to drivers in their assigned branch
    if (isBranchStaff(user)) {
      if (driver.branchId !== user.branchId) {
        throw new ConvexError({ message: "You can only issue credits to drivers in your assigned branch", code: "FORBIDDEN" });
      }
    }

    // Branch secretaries: block if customer has not paid at least 70% of their arrears
    if (isBranchStaff(user)) {
      const openTxs = await ctx.db
        .query("transactions")
        .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
        .collect();

      const now = new Date();
      let totalArrears = 0;
      let totalPaid = 0;

      for (const tx of openTxs) {
        if (tx.status === "paid") continue;
        const days = overdueDays(tx.dueAt, now);
        const penalty = days > 0
          ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
          : 0;
        const liveTotal = Math.round((tx.totalOwedGhs + penalty) * 100) / 100;
        totalArrears += liveTotal;
        totalPaid += tx.amountPaidGhs ?? 0;
      }

      if (totalArrears > 0) {
        const paidPercent = totalPaid / totalArrears;
        if (paidPercent < 0.7) {
          const paidFormatted = totalPaid.toFixed(2);
          const totalFormatted = totalArrears.toFixed(2);
          const pctFormatted = Math.round(paidPercent * 100);
          throw new ConvexError({
            message: `Customer has only paid ${pctFormatted}% (GHS ${paidFormatted}) of their outstanding arrears (GHS ${totalFormatted}). At least 70% must be paid before issuing a new credit.`,
            code: "FORBIDDEN",
          });
        }
      }
    }

    const interestRatePercent = await readInterestRatePercent(ctx);
    if ((args.expectedInterestRatePercent ?? 5) !== interestRatePercent) throw new ConvexError({message:"The interest percentage changed. Refresh the credit form and confirm the new interest amount before issuing.",code:"RATE_CHANGED"});
    const interestGhs = Math.round(args.fuelAmountGhs * interestRatePercent) / 100;
    if (!Number.isFinite(interestGhs)) throw new Error("Interest amount is too large");
    const issuedAt = new Date().toISOString();
    const dueAt = addHours(issuedAt, DUE_HOURS);

    // If interest was collected upfront, driver only owes the principal tomorrow
    const totalOwedGhs = args.interestCollectedUpfront
      ? args.fuelAmountGhs
      : Math.round((args.fuelAmountGhs + interestGhs) * 100) / 100;

    return await ctx.db.insert("transactions", {
      driverId: args.driverId,
      fuelAmountGhs: args.fuelAmountGhs,
      interestGhs,
      interestRatePercent,
      totalOwedGhs,
      interestCollectedUpfront: args.interestCollectedUpfront ?? false,
      issuedAt,
      dueAt,
      status: "pending",
      penaltyGhs: 0,
      notes: args.notes,
      issuedBy: user._id,
    });
  },
});

export const markPaid = mutation({
  args: {
    transactionId: v.id("transactions"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });
    if (tx.status === "paid") throw new ConvexError({ message: "Already paid", code: "CONFLICT" });

    const now = new Date();
    const days = overdueDays(tx.dueAt, now);
    const penaltyGhs =
      days > 0
        ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
        : 0;
    const liveTotal = Math.round((tx.totalOwedGhs + penaltyGhs) * 100) / 100;
    const existingPaid = tx.amountPaidGhs ?? 0;
    const remaining = Math.max(0, Math.round((liveTotal - existingPaid) * 100) / 100);

    // Record the final payment entry if there's still something to pay
    if (remaining > 0) {
      await ctx.db.insert("payments", {
        transactionId: args.transactionId,
        driverId: tx.driverId,
        amountGhs: remaining,
        ...allocatePayment(remaining, existingPaid, tx.fuelAmountGhs, tx.interestCollectedUpfront ? 0 : tx.interestGhs),
        branchId: (await ctx.db.get(tx.driverId))?.branchId,
        note: args.notes,
        recordedBy: user._id,
        recordedAt: now.toISOString(),
      });
    }

    await ctx.db.patch(args.transactionId, {
      status: "paid",
      penaltyGhs,
      amountPaidGhs: liveTotal,
      paidAt: now.toISOString(),
      paidBy: user._id,
      notes: args.notes ?? tx.notes,
    });
  },
});

export const recordPayment = mutation({
  args: {
    transactionId: v.id("transactions"),
    amountGhs: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });
    if (tx.status === "paid") throw new ConvexError({ message: "Transaction already fully paid", code: "CONFLICT" });
    if (args.amountGhs <= 0) throw new ConvexError({ message: "Payment amount must be greater than 0", code: "BAD_REQUEST" });

    const now = new Date();
    const days = overdueDays(tx.dueAt, now);
    const penaltyGhs = days > 0
      ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
      : 0;
    const liveTotal = Math.round((tx.totalOwedGhs + penaltyGhs) * 100) / 100;
    const existingPaid = tx.amountPaidGhs ?? 0;
    if (Math.round(args.amountGhs * 100) > Math.round((liveTotal - existingPaid) * 100)) {
      throw new ConvexError({ message: "Payment exceeds the remaining balance", code: "BAD_REQUEST" });
    }
    const paymentAmount = Math.round(args.amountGhs * 100) / 100;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new ConvexError({ message: "Enter a valid payment amount", code: "BAD_REQUEST" });
    }
    const newAmountPaid = Math.min(
      Math.round((existingPaid + args.amountGhs) * 100) / 100,
      liveTotal
    );
    const isFullyPaid = newAmountPaid >= liveTotal;

    // Log this payment
    await ctx.db.insert("payments", {
      transactionId: args.transactionId,
      driverId: tx.driverId,
      amountGhs: paymentAmount,
      ...allocatePayment(paymentAmount, existingPaid, tx.fuelAmountGhs, tx.interestCollectedUpfront ? 0 : tx.interestGhs),
      branchId: (await ctx.db.get(tx.driverId))?.branchId,
      note: args.note,
      recordedBy: user._id,
      recordedAt: now.toISOString(),
    });

    // Update the transaction
    await ctx.db.patch(args.transactionId, {
      amountPaidGhs: newAmountPaid,
      penaltyGhs,
      ...(isFullyPaid
        ? { status: "paid", paidAt: now.toISOString(), paidBy: user._id }
        : { status: days > 0 ? "overdue" : "pending" }),
    });

    return { isFullyPaid, newAmountPaid, remaining: Math.max(0, liveTotal - newAmountPaid) };
  },
});

export const getPayments = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_transaction", (q) => q.eq("transactionId", args.transactionId))
      .order("asc")
      .collect();
    const withUser = await Promise.all(
      payments.map(async (p) => {
        const user = await ctx.db.get(p.recordedBy);
        return { ...p, recordedByName: user?.name ?? "Staff" };
      })
    );
    return withUser;
  },
});

export const refreshPenalties = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx || tx.status === "paid") return;

    const now = new Date();
    const days = overdueDays(tx.dueAt, now);
    const newStatus = days > 0 ? "overdue" : "pending";
    const penaltyGhs =
      days > 0
        ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
        : 0;

    await ctx.db.patch(args.transactionId, {
      status: newStatus,
      penaltyGhs,
      lastPenaltyCalculatedAt: now.toISOString(),
    });
  },
});

export const listTransactions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    branchId: v.optional(v.id("branches")),
    driverId: v.optional(v.id("drivers")),
    status: v.optional(v.union(v.literal("pending"), v.literal("paid"), v.literal("overdue"))),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    // Branch secretaries are scoped to their branch's drivers
    const isBranchSecretary = isBranchStaff(user) && !!user.branchId;

    if (isBranchStaff(user) && (!user.branchId || (args.branchId && args.branchId !== user.branchId))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const selectedBranch = isBranchSecretary ? user.branchId : args.branchId;
    if (args.driverId) await assertDriverAccess(ctx, user, args.driverId);
    let q;
    if (args.driverId) {
      // If branch secretary, verify this driver belongs to their branch
      if (isBranchSecretary) {
        const driver = await ctx.db.get(args.driverId);
        if (!driver || driver.branchId !== user.branchId) {
          return { page: [], isDone: true, continueCursor: "" };
        }
      }
      q = ctx.db.query("transactions").withIndex("by_driver", (qi) => qi.eq("driverId", args.driverId!));
    } else if (args.status) {
      q = ctx.db.query("transactions").withIndex("by_status", (qi) => qi.eq("status", args.status!));
    } else {
      q = ctx.db.query("transactions").withIndex("by_issued_at");
    }

    if (selectedBranch) {
      const drivers = await ctx.db.query("drivers").withIndex("by_branch", qi => qi.eq("branchId", selectedBranch)).collect();
      if (!drivers.length) return { page: [], isDone: true, continueCursor: "" };
      q = q.filter(qi => qi.or(...drivers.map(driver => qi.eq(qi.field("driverId"), driver._id))));
    }
    const result = await q.order("desc").paginate(args.paginationOpts);

    // Enrich with driver info (and filter for branch secretaries)
    const page = (await Promise.all(
      result.page.map(async (tx) => {
        const driver = await ctx.db.get(tx.driverId);

        // Branch secretaries: skip transactions from other branches
        if (isBranchSecretary && driver?.branchId !== user.branchId) return null;

        const now = new Date();
        const days = tx.status !== "paid" ? overdueDays(tx.dueAt, now) : 0;
        const livePenalty =
          days > 0
            ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
            : tx.penaltyGhs;
        const liveTotal = Math.round((tx.totalOwedGhs + livePenalty) * 100) / 100;
        const liveStatus: "pending" | "paid" | "overdue" =
          tx.status === "paid" ? "paid" : days > 0 ? "overdue" : "pending";

        return {
          ...tx,
          livePenalty,
          liveTotal,
          liveStatus,
          overdueDays: days,
          driverName: driver?.fullName ?? "Unknown",
          driverAccountNumber: driver?.accountNumber ?? "",
          driverPhone: driver?.phone ?? "",
        };
      })
    )).filter((tx): tx is NonNullable<typeof tx> => tx !== null);

    return { ...result, page };
  },
});

export const getTransaction = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return null;
    const driver = await ctx.db.get(tx.driverId);
    const now = new Date();
    const days = tx.status !== "paid" ? overdueDays(tx.dueAt, now) : 0;
    const livePenalty =
      days > 0
        ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100
        : tx.penaltyGhs;
    const liveTotal = Math.round((tx.totalOwedGhs + livePenalty) * 100) / 100;
    const liveStatus: "pending" | "paid" | "overdue" =
      tx.status === "paid" ? "paid" : days > 0 ? "overdue" : "pending";
    return {
      ...tx,
      livePenalty,
      liveTotal,
      liveStatus,
      overdueDays: days,
      amountPaidGhs: tx.amountPaidGhs ?? 0,
      remainingGhs: Math.max(0, Math.round((liveTotal - (tx.amountPaidGhs ?? 0)) * 100) / 100),
      driver,
    };
  },
});

export const getDriverBalance = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args): Promise<{
    totalOwed: number;
    pendingCount: number;
    overdueCount: number;
    paidCount: number;
  }> => {
    const user = await requireStaff(ctx);
    await assertDriverAccess(ctx, user, args.driverId);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_driver", (q) => q.eq("driverId", args.driverId))
      .collect();

    const now = new Date();
    let totalOwed = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let paidCount = 0;

    for (const tx of txs) {
      if (tx.status === "paid") { paidCount++; continue; }
      const days = overdueDays(tx.dueAt, now);
      const penalty = days > 0 ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100 : 0;
      const remaining = Math.max(0, (tx.totalOwedGhs + penalty) - (tx.amountPaidGhs ?? 0));
      totalOwed += remaining;
      if (days > 0) overdueCount++;
      else pendingCount++;
    }

    return {
      totalOwed: Math.round(totalOwed * 100) / 100,
      pendingCount,
      overdueCount,
      paidCount,
    };
  },
});

export const getDashboardStats = query({
  args: {},
  handler: async (ctx): Promise<{
    totalOutstandingGhs: number;
    overdueCount: number;
    activeDrivers: number;
    creditsTodayCount: number;
    creditsTodayGhs: number;
    pendingCount: number;
  }> => {
    const user = await requireStaff(ctx);
    const allowedDrivers = await accessibleDriverIds(ctx, user);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // All open (non-paid) transactions
    const pending = await ctx.db.query("transactions").withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    const overdue = await ctx.db.query("transactions").withIndex("by_status", (q) => q.eq("status", "overdue")).collect();
    const open = [...pending, ...overdue].filter(tx => !allowedDrivers || allowedDrivers.has(tx.driverId));

    let totalOutstandingGhs = 0;
    let overdueCount = 0;
    for (const tx of open) {
      const days = overdueDays(tx.dueAt, now);
      const penalty = days > 0 ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100 : 0;
      const remaining = Math.max(0, (tx.totalOwedGhs + penalty) - (tx.amountPaidGhs ?? 0));
      totalOutstandingGhs += remaining;
      if (days > 0) overdueCount++;
    }

    // Active drivers
    const drivers = await ctx.db.query("drivers").collect();
    const activeDrivers = drivers.filter((d) => d.isActive && (!allowedDrivers || allowedDrivers.has(d._id))).length;

    // Credits issued today
    const allTxs = await ctx.db.query("transactions").withIndex("by_issued_at").order("desc").take(200);
    const todayTxs = allTxs.filter((tx) => (!allowedDrivers || allowedDrivers.has(tx.driverId)) && tx.issuedAt >= todayStart && tx.issuedAt < todayEnd);

    return {
      totalOutstandingGhs: Math.round(totalOutstandingGhs * 100) / 100,
      overdueCount,
      activeDrivers,
      creditsTodayCount: todayTxs.length,
      creditsTodayGhs: Math.round(todayTxs.reduce((s, tx) => s + tx.fuelAmountGhs, 0) * 100) / 100,
      pendingCount: pending.filter(tx => !allowedDrivers || allowedDrivers.has(tx.driverId)).length,
    };
  },
});

export const getDailySummary = query({
  args: { days: v.number() },
  handler: async (ctx, args): Promise<Array<{
    date: string;
    creditsCount: number;
    creditsGhs: number;
    paymentsGhs: number;
    paymentsCount: number;
  }>> => {
    const user = await requireStaff(ctx);
    const allowedDrivers = await accessibleDriverIds(ctx, user);
    const now = new Date();
    const result: Array<{
      date: string; creditsCount: number; creditsGhs: number;
      paymentsGhs: number; paymentsCount: number;
    }> = [];

    for (let i = args.days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = d.toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      const label = d.toLocaleDateString("en-GH", { month: "short", day: "numeric" });

      const txs = await ctx.db.query("transactions").withIndex("by_issued_at").order("asc").collect();
      const dayTxs = txs.filter((tx) => (!allowedDrivers || allowedDrivers.has(tx.driverId)) && tx.issuedAt >= dayStart && tx.issuedAt < dayEnd);

      const payments = await ctx.db.query("payments").withIndex("by_transaction").order("asc").collect();
      const dayPayments = payments.filter((p) => (!allowedDrivers || allowedDrivers.has(p.driverId)) && p.recordedAt >= dayStart && p.recordedAt < dayEnd);

      result.push({
        date: label,
        creditsCount: dayTxs.length,
        creditsGhs: Math.round(dayTxs.reduce((s, tx) => s + tx.fuelAmountGhs, 0) * 100) / 100,
        paymentsGhs: Math.round(dayPayments.reduce((s, p) => s + p.amountGhs, 0) * 100) / 100,
        paymentsCount: dayPayments.length,
      });
    }
    return result;
  },
});

export const getOutstandingBalances = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const allowedDrivers = await accessibleDriverIds(ctx, user);
    const now = new Date();

    const pending = await ctx.db.query("transactions").withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    const overdue = await ctx.db.query("transactions").withIndex("by_status", (q) => q.eq("status", "overdue")).collect();
    const open = [...overdue, ...pending].filter(tx => !allowedDrivers || allowedDrivers.has(tx.driverId)); // overdue first

    const enriched = await Promise.all(open.map(async (tx) => {
      const driver = await ctx.db.get(tx.driverId);
      const days = overdueDays(tx.dueAt, now);
      const penalty = days > 0 ? Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100 : 0;
      const liveTotal = Math.round((tx.totalOwedGhs + penalty) * 100) / 100;
      const remaining = Math.max(0, liveTotal - (tx.amountPaidGhs ?? 0));
      return {
        ...tx,
        driverName: driver?.fullName ?? "Unknown",
        driverAccountNumber: driver?.accountNumber ?? "",
        driverPhone: driver?.phone ?? "",
        isOverdue: days > 0,
        overdueDays: days,
        liveTotal,
        remaining,
        penalty,
      };
    }));

    // Sort by remaining desc
    enriched.sort((a, b) => b.remaining - a.remaining);

    // Manual pagination
    const { numItems, cursor } = args.paginationOpts;
    const startIdx = cursor ? parseInt(cursor) : 0;
    const page = enriched.slice(startIdx, startIdx + numItems);
    const nextCursor = startIdx + numItems < enriched.length ? String(startIdx + numItems) : null;

    return {
      page,
      isDone: nextCursor === null,
      continueCursor: nextCursor ?? "",
    };
  },
});

/**
 * Returns all open transactions that are 3+ days overdue — the Risk Manager alert list.
 */
export const getOverdueAlerts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRiskManagerOrOwner(ctx);
    const allowedDrivers = await accessibleDriverIds(ctx, user);
    const now = new Date();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const pending = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const overdue = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .collect();
    const open = [...pending, ...overdue].filter(tx => !allowedDrivers || allowedDrivers.has(tx.driverId));

    const alerts = [];
    for (const tx of open) {
      const due = new Date(tx.dueAt);
      const msOverdue = now.getTime() - due.getTime();
      if (msOverdue < THREE_DAYS_MS) continue;

      const days = Math.floor(msOverdue / (1000 * 60 * 60 * 24));
      const penalty = Math.round(tx.totalOwedGhs * PENALTY_RATE * penaltyDays(tx.dueAt, now) * 100) / 100;
      const liveTotal = Math.round((tx.totalOwedGhs + penalty) * 100) / 100;
      const remaining = Math.max(0, Math.round((liveTotal - (tx.amountPaidGhs ?? 0)) * 100) / 100);

      const driver = await ctx.db.get(tx.driverId);
      alerts.push({
        ...tx,
        overdueDays: days,
        penalty,
        liveTotal,
        remaining,
        driverName: driver?.fullName ?? "Unknown",
        driverPhone: driver?.phone ?? "",
        driverAccountNumber: driver?.accountNumber ?? "",
        driverIsActive: driver?.isActive ?? false,
      });
    }

    alerts.sort((a, b) => b.overdueDays - a.overdueDays);
    return alerts;
  },
});

/**
 * Pause penalty accrual on a transaction until a given date/time.
 * Only owner and risk_manager can call this.
 */
export const setPenaltyPause = mutation({
  args: {
    transactionId: v.id("transactions"),
    pauseUntil: v.string(),   // ISO string — when the pause should lift
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRiskManagerOrOwner(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });
    if (tx.status === "paid") {
      throw new ConvexError({ message: "Cannot pause penalty on a paid transaction", code: "BAD_REQUEST" });
    }
    const pauseDate = new Date(args.pauseUntil);
    if (isNaN(pauseDate.getTime()) || pauseDate <= new Date()) {
      throw new ConvexError({ message: "Pause-until date must be in the future", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.transactionId, {
      penaltyPausedUntil: pauseDate.toISOString(),
      penaltyPausedBy: user._id,
      penaltyPauseReason: args.reason ?? undefined,
    });
  },
});

/**
 * Clear/resume an active penalty pause on a transaction.
 * Only owner and risk_manager can call this.
 */
export const clearPenaltyPause = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    const user = await requireRiskManagerOrOwner(ctx);
    await assertTransactionAccess(ctx, user, args.transactionId);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.transactionId, {
      penaltyPausedUntil: undefined,
      penaltyPausedBy: undefined,
      penaltyPauseReason: undefined,
    });
  },
});
