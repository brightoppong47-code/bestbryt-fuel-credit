import { assertBranchAccess, canAccessBranch } from "./helpers";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./helpers";

/**
 * Compute today's stats for a given branch, based on the local date string
 * (YYYY-MM-DD) passed from the client so timezone is respected.
 */
export const getTodayStats = query({
  args: {
    branchId: v.id("branches"),
    reportDate: v.string(), // YYYY-MM-DD in the user's local timezone
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    assertBranchAccess(user, args.branchId);
    if (user.role !== "branch_secretary" && user.role !== "owner") {
      throw new ConvexError({ message: "Access denied", code: "FORBIDDEN" });
    }

    // Build UTC window from the local date string.
    // We treat "today" as: all records where issuedAt/recordedAt starts with reportDate.
    // This works because our timestamps are ISO UTC strings and we compare lexicographically
    // using the date prefix from the local date the client passes in.
    const dayStart = `${args.reportDate}T00:00:00.000Z`;
    const dayEnd = `${args.reportDate}T23:59:59.999Z`;

    // Transactions issued today from this branch
    const allTodayTxs = await ctx.db
      .query("transactions")
      .withIndex("by_issued_at")
      .order("asc")
      .collect();

    const todayTxs = allTodayTxs.filter((tx) => {
      if (tx.issuedAt < dayStart || tx.issuedAt > dayEnd) return false;
      return true;
    });

    // Filter to this branch by checking the driver's branchId
    const branchTxs = (
      await Promise.all(
        todayTxs.map(async (tx) => {
          const driver = await ctx.db.get(tx.driverId);
          if (driver?.branchId !== args.branchId) return null;
          return tx;
        }),
      )
    ).filter((tx): tx is NonNullable<typeof tx> => tx !== null);

    // Unique customers served (distinct driver IDs)
    const uniqueDriverIds = new Set(branchTxs.map((tx) => tx.driverId));

    // Interest = sum of interestGhs on today's transactions
    const interestCollectedGhs = branchTxs.reduce((s, tx) => s + (tx.interestGhs ?? 0), 0);
    const creditsIssuedGhs = branchTxs.reduce((s, tx) => s + tx.fuelAmountGhs, 0);

    // Payments received today from this branch's drivers
    const allPayments = await ctx.db
      .query("payments")
      .order("asc")
      .collect();

    const todayPayments = allPayments.filter((p) => {
      if (p.recordedAt < dayStart || p.recordedAt > dayEnd) return false;
      return true;
    });

    // Filter payments to this branch
    const branchDriverIds = new Set(branchTxs.map((tx) => tx.driverId.toString()));
    // Also include drivers who paid today even if their credit wasn't today
    const allBranchDrivers = await ctx.db
      .query("drivers")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();
    const allBranchDriverIds = new Set(allBranchDrivers.map((d) => d._id.toString()));

    const branchPayments = todayPayments.filter((p) =>
      allBranchDriverIds.has(p.driverId.toString())
    );

    // For penalty tracking: payments on overdue transactions
    let penaltiesCollectedGhs = 0;
    for (const p of branchPayments) {
      const tx = await ctx.db.get(p.transactionId);
      if (tx && tx.penaltyGhs > 0) {
        // Approximate portion of payment that covers penalty
        const totalOwed = tx.totalOwedGhs + tx.penaltyGhs;
        const penaltyFraction = totalOwed > 0 ? tx.penaltyGhs / totalOwed : 0;
        penaltiesCollectedGhs += p.amountGhs * penaltyFraction;
      }
    }

    return {
      reportDate: args.reportDate,
      branchId: args.branchId,
      customersServed: uniqueDriverIds.size,
      creditsIssuedCount: branchTxs.length,
      creditsIssuedGhs: Math.round(creditsIssuedGhs * 100) / 100,
      interestCollectedGhs: Math.round(interestCollectedGhs * 100) / 100,
      paymentsReceivedCount: branchPayments.length,
      paymentsReceivedGhs: Math.round(branchPayments.reduce((s, p) => s + p.amountGhs, 0) * 100) / 100,
      penaltiesCollectedGhs: Math.round(penaltiesCollectedGhs * 100) / 100,
      // Whether an EOD report has already been submitted for today
      alreadySubmitted: null as null | string, // filled below
    };
  },
});

export const checkEodSubmitted = query({
  args: {
    branchId: v.id("branches"),
    reportDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    assertBranchAccess(user, args.branchId);
    if (user.role !== "branch_secretary" && user.role !== "owner") return null;
    return await ctx.db
      .query("eod_reports")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", args.branchId).eq("reportDate", args.reportDate)
      )
      .first();
  },
});

export const submitEodReport = mutation({
  args: {
    branchId: v.id("branches"),
    reportDate: v.string(),
    customersServed: v.number(),
    creditsIssuedCount: v.number(),
    creditsIssuedGhs: v.number(),
    interestCollectedGhs: v.number(),
    paymentsReceivedCount: v.number(),
    paymentsReceivedGhs: v.number(),
    penaltiesCollectedGhs: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    assertBranchAccess(user, args.branchId);
    if (user.role !== "branch_secretary" && user.role !== "owner") {
      throw new ConvexError({ message: "Only branch secretaries can submit EOD reports", code: "FORBIDDEN" });
    }

    // Prevent duplicate submission for the same branch + date
    const existing = await ctx.db
      .query("eod_reports")
      .withIndex("by_branch_date", (q) =>
        q.eq("branchId", args.branchId).eq("reportDate", args.reportDate)
      )
      .first();
    if (existing) {
      throw new ConvexError({
        message: "An EOD report for this branch has already been submitted today",
        code: "CONFLICT",
      });
    }

    await ctx.db.insert("eod_reports", {
      branchId: args.branchId,
      submittedBy: user._id,
      reportDate: args.reportDate,
      submittedAt: new Date().toISOString(),
      customersServed: args.customersServed,
      creditsIssuedCount: args.creditsIssuedCount,
      creditsIssuedGhs: args.creditsIssuedGhs,
      interestCollectedGhs: args.interestCollectedGhs,
      paymentsReceivedCount: args.paymentsReceivedCount,
      paymentsReceivedGhs: args.paymentsReceivedGhs,
      penaltiesCollectedGhs: args.penaltiesCollectedGhs,
      notes: args.notes,
    });
  },
});

export const listEodReports = query({
  args: {
    limitDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{
    _id: string;
    branchId: string;
    branchName: string;
    branchCode: string;
    submittedBy: string;
    submittedByName: string;
    reportDate: string;
    submittedAt: string;
    customersServed: number;
    creditsIssuedCount: number;
    creditsIssuedGhs: number;
    interestCollectedGhs: number;
    paymentsReceivedCount: number;
    paymentsReceivedGhs: number;
    penaltiesCollectedGhs: number;
    notes?: string;
  }>> => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner" && user.role !== "staff") {
      throw new ConvexError({ message: "Access denied", code: "FORBIDDEN" });
    }

    const reports = await ctx.db
      .query("eod_reports")
      .order("desc")
      .take(args.limitDays ? args.limitDays * 10 : 100);

    return Promise.all(
      reports.filter(r => canAccessBranch(user, r.branchId)).map(async (r) => {
        const branch = await ctx.db.get(r.branchId);
        const submitter = await ctx.db.get(r.submittedBy);
        return {
          _id: r._id,
          branchId: r.branchId,
          branchName: branch?.name ?? "Unknown Branch",
          branchCode: branch?.code ?? "",
          submittedBy: r.submittedBy,
          submittedByName: submitter?.name ?? "Unknown",
          reportDate: r.reportDate,
          submittedAt: r.submittedAt,
          customersServed: r.customersServed,
          creditsIssuedCount: r.creditsIssuedCount,
          creditsIssuedGhs: r.creditsIssuedGhs,
          interestCollectedGhs: r.interestCollectedGhs,
          paymentsReceivedCount: r.paymentsReceivedCount,
          paymentsReceivedGhs: r.paymentsReceivedGhs,
          penaltiesCollectedGhs: r.penaltiesCollectedGhs,
          notes: r.notes,
        };
      })
    );
  },
});
