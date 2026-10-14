import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireStaff, requireOwner } from "./helpers.ts";

const PENALTY_RATE = 0.05;

function overdueDays(dueAt: string, now: Date): number {
  const due = new Date(dueAt);
  if (now <= due) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Fetch all transactions for CSV export.
 * Optionally filter by status and/or date range (issuedAt).
 * Returns a flat, enriched structure ready to be turned into CSV rows.
 */
export const getAllTransactionsForExport = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("all"),
    )),
    fromDate: v.optional(v.string()), // YYYY-MM-DD
    toDate: v.optional(v.string()),   // YYYY-MM-DD (inclusive)
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = new Date();

    // Fetch by status index when filtered, else scan all via issuedAt index
    let txs;
    if (args.status && args.status !== "all") {
      txs = await ctx.db
        .query("transactions")
        .withIndex("by_status", (q) => q.eq("status", args.status as "pending" | "paid" | "overdue"))
        .collect();
    } else {
      txs = await ctx.db
        .query("transactions")
        .withIndex("by_issued_at")
        .order("desc")
        .collect();
    }

    // Date range filter
    if (args.fromDate || args.toDate) {
      const from = args.fromDate ? args.fromDate : null;
      const to = args.toDate ? args.toDate + "T23:59:59.999Z" : null;
      txs = txs.filter((tx) => {
        const d = tx.issuedAt.slice(0, 10);
        if (from && d < from) return false;
        if (args.toDate && d > args.toDate) return false;
        return true;
      });
    }

    // Enrich with driver and branch info
    const rows = await Promise.all(
      txs.map(async (tx) => {
        const driver = await ctx.db.get(tx.driverId);
        const branch = driver ? await ctx.db.get(driver.branchId) : null;

        const days = tx.status !== "paid" ? overdueDays(tx.dueAt, now) : 0;
        const penalty = days > 0
          ? Math.round(tx.totalOwedGhs * PENALTY_RATE * days * 100) / 100
          : tx.penaltyGhs;
        const liveTotal = Math.round((tx.totalOwedGhs + penalty) * 100) / 100;
        const remaining = Math.max(0, Math.round((liveTotal - (tx.amountPaidGhs ?? 0)) * 100) / 100);
        const liveStatus = tx.status === "paid" ? "paid" : days > 0 ? "overdue" : "pending";

        return {
          "Transaction Date": tx.issuedAt.slice(0, 10),
          "Transaction Time": new Date(tx.issuedAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }),
          "Due Date": tx.dueAt.slice(0, 10),
          "Status": liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1),
          "Driver Name": driver?.fullName ?? "Unknown",
          "Account Number": driver?.accountNumber ?? "",
          "Driver Phone": driver?.phone ?? "",
          "Branch": branch?.name ?? "",
          "Branch Code": branch?.code ?? "",
          "Fuel Amount (GHS)": tx.fuelAmountGhs.toFixed(2),
          "Interest (GHS)": tx.interestGhs.toFixed(2),
          "Interest Collected Upfront": tx.interestCollectedUpfront ? "Yes" : "No",
          "Total Owed (GHS)": tx.totalOwedGhs.toFixed(2),
          "Amount Paid (GHS)": (tx.amountPaidGhs ?? 0).toFixed(2),
          "Penalty (GHS)": penalty.toFixed(2),
          "Days Overdue": days > 0 ? String(days) : "0",
          "Grand Total (GHS)": liveTotal.toFixed(2),
          "Remaining Balance (GHS)": remaining.toFixed(2),
          "Paid Date": tx.paidAt ? tx.paidAt.slice(0, 10) : "",
          "Notes": tx.notes ?? "",
        };
      })
    );

    return rows;
  },
});

/**
 * Fetch all drivers for CSV export.
 */
export const getAllDriversForExport = query({
  args: {
    branchId: v.optional(v.id("branches")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const now = new Date();

    let drivers;
    if (args.branchId) {
      drivers = await ctx.db
        .query("drivers")
        .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
        .collect();
    } else {
      drivers = await ctx.db.query("drivers").collect();
    }

    if (args.activeOnly) {
      drivers = drivers.filter((d) => d.isActive);
    }

    const rows = await Promise.all(
      drivers.map(async (d) => {
        const branch = await ctx.db.get(d.branchId);

        // Outstanding balance
        const txs = await ctx.db
          .query("transactions")
          .withIndex("by_driver", (q) => q.eq("driverId", d._id))
          .collect();

        let outstanding = 0;
        let overdueCount = 0;
        let pendingCount = 0;
        let paidCount = 0;
        for (const tx of txs) {
          if (tx.status === "paid") { paidCount++; continue; }
          const days = overdueDays(tx.dueAt, now);
          const penalty = days > 0 ? Math.round(tx.totalOwedGhs * PENALTY_RATE * days * 100) / 100 : 0;
          const remaining = Math.max(0, (tx.totalOwedGhs + penalty) - (tx.amountPaidGhs ?? 0));
          outstanding += remaining;
          if (days > 0) overdueCount++;
          else pendingCount++;
        }

        return {
          "Account Number": d.accountNumber,
          "Full Name": d.fullName,
          "Phone": d.phone,
          "Vehicle Type": d.vehicleType,
          "Vehicle Plate": d.vehiclePlate,
          "Branch": branch?.name ?? "",
          "Branch Code": branch?.code ?? "",
          "Address": d.address,
          "GPS Address": d.gpsAddress ?? "",
          "Status": d.isActive ? "Active" : "Inactive",
          "Witness Name": d.witnessName ?? "",
          "Witness Phone": d.witnessPhone ?? "",
          "Outstanding Balance (GHS)": outstanding.toFixed(2),
          "Pending Transactions": String(pendingCount),
          "Overdue Transactions": String(overdueCount),
          "Paid Transactions": String(paidCount),
          "Total Transactions": String(txs.length),
          "Notes": d.notes ?? "",
          "Registered Date": new Date(d._creationTime).toISOString().slice(0, 10),
        };
      })
    );

    // Sort by account number
    rows.sort((a, b) => a["Account Number"].localeCompare(b["Account Number"]));
    return rows;
  },
});

/**
 * Fetch all payments for CSV export.
 */
export const getAllPaymentsForExport = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    let payments = await ctx.db
      .query("payments")
      .order("desc")
      .collect();

    if (args.fromDate || args.toDate) {
      payments = payments.filter((p) => {
        const d = p.recordedAt.slice(0, 10);
        if (args.fromDate && d < args.fromDate) return false;
        if (args.toDate && d > args.toDate) return false;
        return true;
      });
    }

    const rows = await Promise.all(
      payments.map(async (p) => {
        const driver = await ctx.db.get(p.driverId);
        const branch = driver ? await ctx.db.get(driver.branchId) : null;
        const recorder = await ctx.db.get(p.recordedBy);

        return {
          "Payment Date": p.recordedAt.slice(0, 10),
          "Payment Time": new Date(p.recordedAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }),
          "Driver Name": driver?.fullName ?? "Unknown",
          "Account Number": driver?.accountNumber ?? "",
          "Driver Phone": driver?.phone ?? "",
          "Branch": branch?.name ?? "",
          "Amount Received (GHS)": p.amountGhs.toFixed(2),
          "Recorded By": recorder?.name ?? "Staff",
          "Note": p.note ?? "",
        };
      })
    );

    return rows;
  },
});


// Collections report: read-only; older payment allocations are reconstructed.
export const collections = query({
  args: { fromDate: v.string(), toDate: v.string(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!validDate(args.fromDate) || !validDate(args.toDate) || args.fromDate > args.toDate) {
      throw new Error("Choose a valid date range");
    }
    if (user.role === "branch_secretary" && (!user.branchId || (args.branchId && args.branchId !== user.branchId))) {
      throw new Error("You can only report on your assigned branch");
    }
    const branchId = user.role === "branch_secretary" ? user.branchId : args.branchId;
    const [transactions, payments, drivers, branches] = await Promise.all([
      ctx.db.query("transactions").collect(), ctx.db.query("payments").collect(),
      ctx.db.query("drivers").collect(), ctx.db.query("branches").collect(),
    ]);
    const txMap = new Map(transactions.map(t => [t._id, t]));
    const driverMap = new Map(drivers.map(d => [d._id, d]));
    const branchMap = new Map(branches.map(b => [b._id, b]));
    const branchCredits = new Map<string, { branchId: string; branch: string; creditsCount: number; creditsGhs: number }>(
      branches.filter(b => !branchId || b._id === branchId).map(b => [b._id, { branchId: b._id, branch: b.name, creditsCount: 0, creditsGhs: 0 }])
    );
    const inRange = (at: string) => at.slice(0, 10) >= args.fromDate && at.slice(0, 10) <= args.toDate;
    const totals = { principalGhs: 0, interestGhs: 0, penaltyGhs: 0, cashGhs: 0, creditsGhs: 0, paymentsCount: 0, reconstructedCount: 0 };
    const daily = new Map<string, { date: string; principalGhs: number; interestGhs: number; penaltyGhs: number; cashGhs: number; creditsGhs: number }>();
    const day = (at: string) => {
      const date = at.slice(0, 10);
      if (!daily.has(date)) daily.set(date, { date, principalGhs: 0, interestGhs: 0, penaltyGhs: 0, cashGhs: 0, creditsGhs: 0 });
      return daily.get(date)!;
    };
    const rows: Array<{ date: string; customer: string; branch: string; principalGhs: number; interestGhs: number; penaltyGhs: number; cashGhs: number; reconstructed: boolean; kind: string }> = [];
    // Replay all payments, including those before the selected range, so partial allocations remain consistent.
    const paidByTx = new Map<string, number>();
    for (const p of payments.sort((a,b) => a.recordedAt.localeCompare(b.recordedAt) || a._creationTime - b._creationTime || a._id.localeCompare(b._id))) {
      const tx = txMap.get(p.transactionId);
      if (!tx) continue;
      const previous = paidByTx.get(p.transactionId) ?? 0;
      paidByTx.set(p.transactionId, previous + p.amountGhs);
      const driver = driverMap.get(p.driverId);
      const paymentBranch = driver?.branchId;
      if (!inRange(p.recordedAt) || (branchId && paymentBranch !== branchId)) continue;
      const reconstructed = true;
      const principalGhs = Math.min(p.amountGhs, Math.max(0, tx.fuelAmountGhs - previous));
      const deferredInterest = tx.interestCollectedUpfront ? 0 : tx.interestGhs;
      const interestGhs = Math.min(Math.max(0, p.amountGhs - principalGhs), Math.max(0, deferredInterest - Math.max(0, previous - tx.fuelAmountGhs)));
      const penaltyGhs = Math.max(0, p.amountGhs - principalGhs - interestGhs);
      const split = { principalGhs, interestGhs, penaltyGhs };
      const d = day(p.recordedAt);
      for (const k of ["principalGhs", "interestGhs", "penaltyGhs"] as const) { totals[k] += split[k]; d[k] += split[k]; }
      totals.cashGhs += p.amountGhs; d.cashGhs += p.amountGhs;
      totals.paymentsCount++; if (reconstructed) totals.reconstructedCount++;
      rows.push({ date: p.recordedAt, customer: driver?.fullName ?? "Unknown customer", branch: paymentBranch ? branchMap.get(paymentBranch)?.name ?? "Unknown branch" : "Unknown branch", ...split, cashGhs: p.amountGhs, reconstructed, kind: "Repayment" });
    }
    for (const tx of transactions) {
      const driver = driverMap.get(tx.driverId);
      if (!inRange(tx.issuedAt) || (branchId && driver?.branchId !== branchId)) continue;
      const d = day(tx.issuedAt);
      totals.creditsGhs += tx.fuelAmountGhs; d.creditsGhs += tx.fuelAmountGhs;
      const creditBranchId = driver?.branchId ?? "unknown";
      if (!branchCredits.has(creditBranchId)) branchCredits.set(creditBranchId, { branchId: creditBranchId, branch: branchMap.get(creditBranchId as Id<"branches">)?.name ?? "Unknown branch", creditsCount: 0, creditsGhs: 0 });
      const creditBranch = branchCredits.get(creditBranchId)!;
      creditBranch.creditsCount++;
      creditBranch.creditsGhs += tx.fuelAmountGhs;
      if (tx.interestCollectedUpfront) {
        totals.interestGhs += tx.interestGhs; totals.cashGhs += tx.interestGhs;
        d.interestGhs += tx.interestGhs; d.cashGhs += tx.interestGhs;
        rows.push({ date: tx.issuedAt, customer: driver?.fullName ?? "Unknown customer", branch: driver ? branchMap.get(driver.branchId)?.name ?? "Unknown branch" : "Unknown branch", principalGhs: 0, interestGhs: tx.interestGhs, penaltyGhs: 0, cashGhs: tx.interestGhs, reconstructed: false, kind: "Upfront interest" });
      }
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    for (const key of ["principalGhs", "interestGhs", "penaltyGhs", "cashGhs", "creditsGhs"] as const) {
      totals[key] = round(totals[key]); for (const d of daily.values()) d[key] = round(d[key]);
    }
    const creditSummary = [...branchCredits.values()].map(b => ({ ...b, creditsGhs: round(b.creditsGhs) })).sort((a,b) => a.branch.localeCompare(b.branch));
    return { totals, branchCredits: creditSummary, daily: [...daily.values()].sort((a,b) => a.date.localeCompare(b.date)), rows: rows.sort((a,b) => b.date.localeCompare(a.date)) };
  },
});
