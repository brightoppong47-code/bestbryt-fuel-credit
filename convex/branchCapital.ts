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
    const [branches, drivers, credits, payments, handovers] = await Promise.all([
      ctx.db.query("branches").collect(), ctx.db.query("drivers").collect(), ctx.db.query("transactions").collect(),
      ctx.db.query("payments").collect(), ctx.db.query("collection_handovers").collect(),
    ]);
    const driverBranches = new Map(drivers.map(d => [d._id, d.branchId]));
    const rows = await Promise.all(branches.map(async branch => {
      const count = await ctx.db.query("branch_cash_counts").withIndex("by_branch_time", q => q.eq("branchId", branch._id)).order("desc").first();
      let principalGhs = 0, interestGhs = 0, penaltyGhs = 0, overdueGhs = 0, openCredits = 0;
      let cashChangeGhs = 0, reviewItems = 0;
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
        if (count && tx._creationTime > count._creationTime) {
          cashChangeGhs -= tx.fuelAmountGhs;
          if (tx.interestCollectedUpfront) { cashChangeGhs += tx.interestGhs; reviewItems++; }
        }
      }
      if (count) {
        for (const p of payments) {
          if ((p.branchId ?? driverBranches.get(p.driverId)) !== branch._id || p._creationTime <= count._creationTime) continue;
          // Company-wallet receipts are not funds held at the branch.
          if (p.paymentMethod !== "company_momo" && p.reconciliationStatus !== "disputed") cashChangeGhs += p.amountGhs;
          if (!p.paymentMethod || p.reconciliationStatus !== "verified") reviewItems++;
        }
        for (const h of handovers) {
          if (h.branchId !== branch._id || h._creationTime <= count._creationTime) continue;
          if (h.status !== "disputed") cashChangeGhs -= h.amountGhs;
          if (h.status !== "verified") reviewItems++;
        }
      }
      const cashAvailableGhs = count ? money(count.amountGhs + cashChangeGhs) : null;
      return { branchId: branch._id, branch: branch.name, active: branch.isActive, cashAvailableGhs,
        principalGhs: money(principalGhs), interestGhs: money(interestGhs), penaltyGhs: money(penaltyGhs),
        totalOutstandingGhs: money(principalGhs + interestGhs + penaltyGhs), overdueGhs: money(overdueGhs), openCredits,
        capitalGhs: cashAvailableGhs === null ? null : money(cashAvailableGhs + principalGhs),
        lastCountAt: count?.countedAt ?? null, lastCountGhs: count?.amountGhs ?? null, reviewItems,
      };
    }));
    return { generatedAt: now.toISOString(), rows: rows.sort((a,b) => a.branch.localeCompare(b.branch)) };
  },
});
