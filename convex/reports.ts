import { assignedBranchIds, canAccessBranch, isBranchStaff } from "./helpers";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { requireStaff, requireFinance } from "./helpers";
import { allocatePayment } from "./lib/paymentAllocation";

export const collections = query({
  args: { fromDate: v.string(), toDate: v.string(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!validDate(args.fromDate) || !validDate(args.toDate) || args.fromDate > args.toDate) {
      throw new ConvexError({ message: "Choose a valid date range", code: "BAD_REQUEST" });
    }
    if (isBranchStaff(user) && (!assignedBranchIds(user).length || (args.branchId && !canAccessBranch(user,args.branchId)))) {
      throw new ConvexError({ message: "You can only report on your assigned branch", code: "FORBIDDEN" });
    }
    const branchId = args.branchId ?? (isBranchStaff(user) && assignedBranchIds(user).length === 1 ? assignedBranchIds(user)[0] : undefined);
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
      const paymentBranch = driver?.branchId;
      if (!canAccessBranch(user,paymentBranch) || !inRange(p.recordedAt) || (branchId && paymentBranch !== branchId)) continue;
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
      if (!canAccessBranch(user,driver?.branchId) || !inRange(tx.issuedAt) || (branchId && driver?.branchId !== branchId)) continue;
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


/** Owner-only financial adjustment audit report. Adjustments change debt, not cash collected. */
export const adjustmentAudit = query({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, args) => {
    await requireFinance(ctx);
    const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!valid(args.fromDate) || !valid(args.toDate) || args.fromDate > args.toDate) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Choose a valid date range" });
    }
    const adjustments = await ctx.db.query("transaction_adjustments").collect();
    const filtered = adjustments.filter(a => a.createdAt.slice(0, 10) >= args.fromDate && a.createdAt.slice(0, 10) <= args.toDate);
    const rows = await Promise.all(filtered.map(async a => {
      const [driver, actor] = await Promise.all([ctx.db.get(a.driverId), ctx.db.get(a.actorId)]);
      return {
        ...a,
        customer: driver?.fullName ?? "Unknown customer",
        actorName: actor?.name ?? "Unknown admin",
      };
    }));
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      totals: {
        principalGhs: round(filtered.filter(a => a.component === "principal").reduce((sum, a) => sum + a.deltaGhs, 0)),
        interestGhs: round(filtered.filter(a => a.component === "interest").reduce((sum, a) => sum + a.deltaGhs, 0)),
        penaltyGhs: round(filtered.filter(a => a.component === "penalty").reduce((sum, a) => sum + a.deltaGhs, 0)),
        adjustmentsCount: filtered.length,
      },
      rows: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },
});

/** Unified append-only financial audit: the caller cannot supply the actor identity. */
export const financialAudit = query({
  args: {fromDate:v.string(),toDate:v.string()},
  handler: async (ctx,args) => {
    await requireFinance(ctx);
    const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
    if(!valid(args.fromDate)||!valid(args.toDate)||args.fromDate>args.toDate) throw new ConvexError("Choose a valid audit date range");
    const [adjustments,events,users,drivers,branches]=await Promise.all([ctx.db.query("transaction_adjustments").collect(),ctx.db.query("collection_reconciliation_events").collect(),ctx.db.query("users").collect(),ctx.db.query("drivers").collect(),ctx.db.query("branches").collect()]);
    const userMap=new Map(users.map(u=>[u._id,u])),driverMap=new Map(drivers.map(d=>[d._id,d])),branchMap=new Map(branches.map(b=>[b._id,b]));
    const identity=(e:{actorId:import("./_generated/dataModel").Id<"users">;actorName?:string;actorEmail?:string;actorRole?:string})=>{
      const u=userMap.get(e.actorId);return {actorName:e.actorName??u?.name??u?.email??"Unknown user",actorEmail:e.actorEmail??u?.email??"",actorRole:e.actorRole??u?.role??"Unknown role",actorId:e.actorId};
    };
    const cashCounts = await ctx.db.query("branch_cash_counts").collect();
    const rows=[...cashCounts.map(c=>({_id:c._id,date:new Date(c.countedAt).toISOString(),type:"Branch cash count",amountGhs:c.amountGhs,branch:branchMap.get(c.branchId)?.name??"Unknown branch",reference:String(c._id),transactionId:null,reason:c.note,...identity({...c,actorId:c.recordedBy})})),...adjustments.map(a=>({_id:a._id,date:a.createdAt,type:`${a.component} adjustment`,amountGhs:a.deltaGhs,branch:branchMap.get(driverMap.get(a.driverId)?.branchId!)?.name??"Unknown branch",reference:String(a.transactionId),transactionId:String(a.transactionId),reason:a.reason,...identity(a)})),
      ...events.map(e=>({_id:e._id,date:e.occurredAt,type:`${e.paymentId?"Payment":"Handover"} ${e.action}`,amountGhs:null,branch:branchMap.get(e.branchId)?.name??"Unknown branch",reference:String(e.paymentId??e.handoverId??e._id),transactionId:null,reason:e.note,...identity(e)}))];
    return rows.filter(r=>r.date.slice(0,10)>=args.fromDate&&r.date.slice(0,10)<=args.toDate).sort((a,b)=>b.date.localeCompare(a.date)||b._id.localeCompare(a._id));
  },
});
