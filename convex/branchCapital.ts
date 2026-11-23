import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireFinance, auditIdentity } from "./helpers";
import { readInterestRatePercent } from "./appSettings";
import { adjustedBalance } from "./lib/adjustedBalance";
const money = (n: number) => Math.round(n * 100) / 100;

/** An actual cash/branch-wallet count; append-only so every reset is auditable. */
export const recordCashCount = mutation({
  args: { branchId: v.id("branches"), amountGhs: v.number(), note: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireFinance(ctx);
    if (!await ctx.db.get(args.branchId)) throw new ConvexError("Branch not found");
    if (!Number.isFinite(args.amountGhs) || args.amountGhs < 0 || Math.abs(args.amountGhs - money(args.amountGhs)) > 1e-7) throw new ConvexError("Enter a nonnegative cash amount with at most two decimal places");
    const note = args.note.trim();
    if (note.length < 5 || note.length > 500) throw new ConvexError("Enter a cash-count note of 5 to 500 characters");
    return await ctx.db.insert("branch_cash_counts", { ...args, amountGhs: money(args.amountGhs), note, countedAt: Date.now(), recordedBy: owner._id, ...auditIdentity(owner) });
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireFinance(ctx);
    const now = new Date(), rate = (await readInterestRatePercent(ctx)) / 100;
    const [branches, drivers, credits] = await Promise.all([
      ctx.db.query("branches").collect(), ctx.db.query("drivers").collect(), ctx.db.query("transactions").collect(),
    ]);
    const today = now.toISOString().slice(0, 10);
    const dayStart = Date.parse(today + "T00:00:00Z"), dayEnd = dayStart + 86400000;
    const driverBranches = new Map(drivers.map(d => [d._id, d.branchId]));
    const rows = await Promise.all(branches.map(async branch => {
      const count = await ctx.db.query("branch_cash_counts").withIndex("by_branch_time", q => q.eq("branchId", branch._id)).order("desc").first();
      let principalGhs = 0, interestGhs = 0, penaltyGhs = 0, overdueGhs = 0, openCredits = 0;
      let fuelCreditedTodayGhs = 0;
      for (const tx of credits) {
        if (driverBranches.get(tx.driverId) !== branch._id) continue;
        if (tx.status !== "paid") {
          const b = adjustedBalance(tx, now, rate), paid = tx.amountPaidGhs ?? 0;
          const principal = Math.max(0, b.principal - paid);
          const interest = tx.interestCollectedUpfront ? 0 : Math.max(0, b.interest - Math.max(0, paid - b.principal));
          const penalty = Math.max(0, b.remaining - principal - interest);
          principalGhs += principal; interestGhs += interest; penaltyGhs += penalty; openCredits++;
          if (now.getTime() > Date.parse(tx.dueAt)) overdueGhs += b.remaining;
        }
        const issuedAt = Date.parse(tx.issuedAt);
        if (issuedAt >= dayStart && issuedAt < dayEnd) fuelCreditedTodayGhs += tx.fuelAmountGhs;
      }
      const cashAvailableGhs = count ? money(count.amountGhs - fuelCreditedTodayGhs) : null;
      return { branchId: branch._id, branch: branch.name, active: branch.isActive, cashAvailableGhs,
        principalGhs: money(principalGhs), interestGhs: money(interestGhs), penaltyGhs: money(penaltyGhs),
        totalOutstandingGhs: money(principalGhs + interestGhs + penaltyGhs), overdueGhs: money(overdueGhs), openCredits,
        capitalGhs: cashAvailableGhs === null ? null : money(cashAvailableGhs + principalGhs),
        lastCountAt: count?.countedAt ?? null, lastCountGhs: count?.amountGhs ?? null, fuelCreditedTodayGhs: money(fuelCreditedTodayGhs), reviewItems: 0,
      };
    }));
    return { generatedAt: now.toISOString(), cashDate: today, rows: rows.sort((a,b) => a.branch.localeCompare(b.branch)) };
  },
});
