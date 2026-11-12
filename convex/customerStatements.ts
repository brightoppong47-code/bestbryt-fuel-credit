import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { assertDriverAccess, requireStaff } from "./helpers";
import { adjustedBalance } from "./lib/adjustedBalance";

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const money = (n: number) => Math.round(n * 100) / 100;

/** Read-only customer ledger; balances are as of the report generation time, not a historical snapshot. */
export const statement = query({
  args: { driverId: v.id("drivers"), fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const driver = await assertDriverAccess(ctx, user, args.driverId);
    if (!driver) throw new ConvexError({ code: "NOT_FOUND", message: "Customer not found" });
    if (!validDate(args.fromDate) || !validDate(args.toDate) || args.fromDate > args.toDate)
      throw new ConvexError({ code: "BAD_REQUEST", message: "Choose a valid statement date range" });
    const branch = await ctx.db.get(driver.branchId);
    const [transactions, payments] = await Promise.all([
      ctx.db.query("transactions").withIndex("by_driver", q => q.eq("driverId", args.driverId)).collect(),
      ctx.db.query("payments").withIndex("by_driver", q => q.eq("driverId", args.driverId)).collect(),
    ]);
    const rows: Array<{ date: string; type: string; reference: string; description: string; debitGhs: number; creditGhs: number }> = [];
    const allRows: typeof rows = [];
    const txIds = new Set(transactions.map(t => t._id));
    const adjustments = (await ctx.db.query("transaction_adjustments").collect()).filter(a => a.driverId === args.driverId && txIds.has(a.transactionId));
    for (const tx of transactions) {
      allRows.push({ date: tx.issuedAt, type: "Fuel credit", reference: tx._id, description: "Fuel principal", debitGhs: tx.fuelAmountGhs, creditGhs: 0 });
      if (tx.interestGhs) {
        allRows.push({ date: tx.issuedAt, type: "Interest", reference: tx._id, description: tx.interestCollectedUpfront ? "Interest collected upfront" : "Interest charged", debitGhs: tx.interestGhs, creditGhs: 0 });
        if (tx.interestCollectedUpfront) allRows.push({ date: tx.issuedAt, type: "Upfront interest paid", reference: tx._id, description: "Interest received at issuance", debitGhs: 0, creditGhs: tx.interestGhs });
      }
      // Penalties may accrue daily; show current assessed amount separately rather than backdating it.
    }
    for (const p of payments) allRows.push({ date: p.recordedAt, type: "Repayment", reference: p.receiptNumber ?? p._id, description: p.paymentMethod ?? "Customer repayment", debitGhs: 0, creditGhs: p.amountGhs });
    for (const a of adjustments) allRows.push({ date: a.createdAt, type: "Admin correction", reference: a.transactionId, description: a.component + ": " + a.reason, debitGhs: Math.max(0, a.deltaGhs), creditGhs: Math.max(0, -a.deltaGhs) });
    allRows.sort((a,b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference) || a.type.localeCompare(b.type));
    const before = allRows.filter(r => r.date.slice(0,10) < args.fromDate);
    const inRange = allRows.filter(r => r.date.slice(0,10) >= args.fromDate && r.date.slice(0,10) <= args.toDate);
    let running = money(before.reduce((s,r) => s+r.debitGhs-r.creditGhs,0));
    for (const r of inRange) { running = money(running+r.debitGhs-r.creditGhs); rows.push(r); }
    const now = new Date();
    const currentOutstandingGhs = money(transactions.reduce((s,t) => s+(t.status === "paid" ? 0 : adjustedBalance(t,now).remaining),0));
    const currentPenaltyGhs = money(transactions.filter(t => t.status !== "paid").reduce((s,t) => s+adjustedBalance(t,now).penalty,0));
    return {
      customer: { name: driver.fullName, account: driver.accountNumber, phone: driver.phone, branch: branch?.name ?? "Unknown branch" },
      fromDate: args.fromDate, toDate: args.toDate, generatedAt: now.toISOString(),
      openingLedgerGhs: money(before.reduce((s,r) => s+r.debitGhs-r.creditGhs,0)),
      debitGhs: money(rows.reduce((s,r) => s+r.debitGhs,0)),
      creditGhs: money(rows.reduce((s,r) => s+r.creditGhs,0)),
      closingLedgerGhs: running,
      currentOutstandingGhs, currentPenaltyGhs,
      rows,
      note: "Ledger closing balance excludes time-accrued penalties, which are shown in the current outstanding figure. Current outstanding is calculated as of generation time, not the historical end date.",
    };
  },
});
