import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";

async function fixture() {
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"test|owner"});
    await ctx.db.insert("users",{role:"staff",tokenIdentifier:"test|staff"});
    const branchId=await ctx.db.insert("branches",{name:"Test",code:"T",isActive:true,nextSequence:2,createdBy:owner});
    const driverId=await ctx.db.insert("drivers",{fullName:"Test customer",phone:"000",address:"Test",vehicleType:"Taxi",vehiclePlate:"TEST",gpsLatitude:0,gpsLongitude:0,branchId,accountNumber:"T1",sequenceNumber:1,isActive:true,registeredBy:owner});
    return {driverId};
  });
  return {t,ids,owner:t.withIdentity({tokenIdentifier:"test|owner"}),staff:t.withIdentity({tokenIdentifier:"test|staff"})};
}

afterEach(() => vi.useRealTimers());
it("uses the configured 10% across balances, statements, exports, scheduled penalties and settlement", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z")); // Monday; Saturday + Monday count, Sunday does not.
  const { t, ids, owner } = await fixture();
  await owner.mutation(api.appSettings.setInterestRate, {interestRatePercent: 10});
  const txId = await t.run(async ctx => {
    const user = await ctx.db.query("users").first();
    return ctx.db.insert("transactions", { driverId: ids.driverId, fuelAmountGhs:100, interestGhs:5,
      interestRatePercent:5, interestCollectedUpfront:true, totalOwedGhs:100,
      dueAt:"2026-11-13T12:00:00Z", issuedAt:"2026-11-12T12:00:00Z", status:"overdue",
      penaltyGhs:0, issuedBy:user!._id });
  });
  expect(await owner.query(api.transactions.getTransaction, {transactionId:txId})).toMatchObject({livePenalty:20,remainingGhs:120,penaltyRatePercent:10,interestGhs:5});
  expect(await owner.query(api.customerStatements.statement, {driverId:ids.driverId,fromDate:"2026-11-01",toDate:"2026-11-16"})).toMatchObject({currentPenaltyGhs:20,currentOutstandingGhs:120});
  const rows = await owner.query(api.exports.getAllTransactionsForExport, {});
  expect(rows[0]["Penalty (GHS)"]).toBe("20.00");
  expect((await owner.query(api.exports.getAllDriversForExport, {}))[0]["Outstanding Balance (GHS)"]).toBe("120.00");
  await t.mutation(internal.penalties.updatePenaltiesAndStatuses, {});
  expect(await t.run(ctx => ctx.db.get(txId))).toMatchObject({penaltyGhs:20});
  // A subsequent settings change must not leave any hardcoded penalty percentage.
  await owner.mutation(api.appSettings.setInterestRate, {interestRatePercent:12});
  expect(await owner.query(api.transactions.getTransaction, {transactionId:txId})).toMatchObject({livePenalty:24,interestGhs:5});
  await owner.mutation(api.appSettings.setInterestRate, {interestRatePercent:10});
  await owner.mutation(api.transactions.recordPayment, {transactionId:txId,amountGhs:120});
  expect(await t.run(ctx => ctx.db.get(txId))).toMatchObject({status:"paid",penaltyGhs:20,amountPaidGhs:120});
  await owner.mutation(api.appSettings.setInterestRate, {interestRatePercent:0});
  expect(await owner.query(api.transactions.getTransaction, {transactionId:txId})).toMatchObject({livePenalty:20,remainingGhs:0});
});
