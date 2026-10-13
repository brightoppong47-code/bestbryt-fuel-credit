import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { requireStaff } from "./helpers";
import { allocatePayment } from "./lib/paymentAllocation";

export const collections = query({
  args: { fromDate: v.string(), toDate: v.string(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!validDate(args.fromDate) || !validDate(args.toDate) || args.fromDate > args.toDate) {
      throw new ConvexError({ message: "Choose a valid date range", code: "BAD_REQUEST" });
    }
    if (user.role === "branch_secretary" && (!user.branchId || (args.branchId && args.branchId !== user.branchId))) {
      throw new ConvexError({ message: "You can only report on your assigned branch", code: "FORBIDDEN" });
    }
    const branchId = user.role === "branch_secretary" ? user.branchId : args.branchId;
    const [transactions, payments, drivers, branches] = await Promise.all([
      ctx.db.query("transactions").collect(), ctx.db.query("payments").collect(),
      ctx.db.query("drivers").collect(), ctx.db.query("branches").collect(),
    ]);
    const txMap = new Map(transactions.map(t => [t._id, t]));
    const driverMap = new Map(drivers.map(d => [d._id, d]));
    const branchMap = new Map(branches.map(b => [b._id, b]));
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
      const paymentBranch = p.branchId ?? driver?.branchId;
      if (!inRange(p.recordedAt) || (branchId && paymentBranch !== branchId)) continue;
      const reconstructed = p.principalGhs === undefined || p.interestGhs === undefined || p.penaltyGhs === undefined;
      const split = reconstructed ? allocatePayment(p.amountGhs, previous, tx.fuelAmountGhs, tx.interestCollectedUpfront ? 0 : tx.interestGhs)
        : { principalGhs: p.principalGhs!, interestGhs: p.interestGhs!, penaltyGhs: p.penaltyGhs! };
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
    return { totals, daily: [...daily.values()].sort((a,b) => a.date.localeCompare(b.date)), rows: rows.sort((a,b) => b.date.localeCompare(a.date)) };
  },
});
