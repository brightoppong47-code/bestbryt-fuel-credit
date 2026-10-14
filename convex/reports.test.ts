import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { allocatePayment } from "./lib/paymentAllocation";

describe("collections accounting", () => {
  it("separates principal and penalties in a full settlement", () => {
    expect(allocatePayment(230, 0, 200, 0)).toEqual({ principalGhs: 200, interestGhs: 0, penaltyGhs: 30 });
  });
  it("settles partial principal before deferred interest and penalties", () => {
    expect(allocatePayment(150, 0, 200, 10)).toEqual({ principalGhs: 150, interestGhs: 0, penaltyGhs: 0 });
    expect(allocatePayment(90, 150, 200, 10)).toEqual({ principalGhs: 50, interestGhs: 10, penaltyGhs: 30 });
    expect(allocatePayment(0.03, 0.99, 1, 0.01)).toEqual({principalGhs:0.01,interestGhs:0.01,penaltyGhs:0.01});
  });
  it("replays prior payments, includes upfront interest once and honours date/branch filters", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const userId = await ctx.db.insert("users", { name: "Owner", role: "owner", tokenIdentifier: "test|owner" });
      const branchId = await ctx.db.insert("branches", { name: "Main", code: "M", isActive: true, nextSequence: 2, createdBy: userId });
      const other = await ctx.db.insert("branches", { name: "Other", code: "O", isActive: true, nextSequence: 1, createdBy: userId });
      const driverId = await ctx.db.insert("drivers", { fullName: "Customer", phone: "0500000000", vehicleType: "Taxi", vehiclePlate: "TEST", address: "Ghana", gpsLatitude:0, gpsLongitude:0, branchId, accountNumber: "M001", sequenceNumber: 1, isActive: true, registeredBy: userId });
      const txId = await ctx.db.insert("transactions", { driverId, fuelAmountGhs: 200, interestGhs: 10, interestCollectedUpfront: true, totalOwedGhs: 200, issuedAt: "2026-10-01T10:00:00.000Z", dueAt: "2026-10-02T10:00:00.000Z", status: "paid", penaltyGhs: 30, amountPaidGhs: 230, issuedBy: userId });
      for (const [amountGhs, recordedAt] of [[150, "2026-10-03T09:00:00.000Z"], [80, "2026-10-04T23:59:59.999Z"]] as const) {
        await ctx.db.insert("payments", { transactionId: txId, driverId, recordedBy: userId, amountGhs, recordedAt });
      }
      return { branchId, other };
    });
    const client = t.withIdentity({ tokenIdentifier: "test|owner" });
    const report = await client.query(api.reports.collections, { fromDate: "2026-10-04", toDate: "2026-10-04", branchId: ids.branchId });
    expect(report.totals).toMatchObject({ principalGhs: 50, interestGhs: 0, penaltyGhs: 30, cashGhs: 80, reconstructedCount: 1 });
    const all = await client.query(api.reports.collections, { fromDate: "2026-10-01", toDate: "2026-10-04" });
    expect(all.totals).toMatchObject({ principalGhs: 200, interestGhs: 10, penaltyGhs: 30, cashGhs: 240 });
    const other = await client.query(api.reports.collections, { fromDate: "2026-10-01", toDate: "2026-10-04", branchId: ids.other });
    expect(other.totals.cashGhs).toBe(0);
    const fuel = await client.query(api.exports.collections, {fromDate:"2026-10-01",toDate:"2026-10-04"});
    expect(fuel.branchCredits).toEqual([
      {branchId:ids.branchId,branch:"Main",creditsCount:1,creditsGhs:200},
      {branchId:ids.other,branch:"Other",creditsCount:0,creditsGhs:0},
    ]);
    expect(fuel.branchCredits.reduce((n,b)=>n+b.creditsGhs,0)).toBe(fuel.totals.creditsGhs);
    const outside = await client.query(api.exports.collections, {fromDate:"2026-10-04",toDate:"2026-10-04",branchId:ids.branchId});
    expect(outside.branchCredits).toEqual([{branchId:ids.branchId,branch:"Main",creditsCount:0,creditsGhs:0}]);
    await t.run(async ctx=>ctx.db.insert("users",{role:"branch_secretary",branchId:ids.branchId,tokenIdentifier:"test|secretary"}));
    const secretary=t.withIdentity({tokenIdentifier:"test|secretary"});
    const scoped=await secretary.query(api.exports.collections,{fromDate:"2026-10-01",toDate:"2026-10-04"});
    expect(scoped.branchCredits).toEqual([{branchId:ids.branchId,branch:"Main",creditsCount:1,creditsGhs:200}]);
    await expect(secretary.query(api.exports.collections,{fromDate:"2026-10-01",toDate:"2026-10-04",branchId:ids.other})).rejects.toThrow("assigned branch");
    await expect(client.query(api.reports.collections, { fromDate: "2026-10-05", toDate: "2026-10-04" })).rejects.toThrow();
  });
  it("saves separate repayment components and rejects excess payments", async () => {
    const t = convexTest(schema, modules);
    const txId = await t.run(async ctx => {
      const userId = await ctx.db.insert("users", { name: "Owner", role: "owner", tokenIdentifier: "test|owner" });
      const branchId = await ctx.db.insert("branches", { name: "Main", code: "M", isActive: true, nextSequence: 2, createdBy: userId });
      const driverId = await ctx.db.insert("drivers", { fullName: "Customer", phone: "0500000000", vehicleType: "Taxi", vehiclePlate: "TEST", address: "Ghana", gpsLatitude: 0, gpsLongitude: 0, branchId, accountNumber: "M001", sequenceNumber: 1, isActive: true, registeredBy: userId });
      return ctx.db.insert("transactions", { driverId, fuelAmountGhs: 200, interestGhs: 10, interestCollectedUpfront: false, totalOwedGhs: 210, issuedAt: new Date().toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString(), status: "pending", penaltyGhs: 0, issuedBy: userId });
    });
    const client = t.withIdentity({ tokenIdentifier: "test|owner" });
    await client.mutation(api.transactions.recordPayment, { transactionId: txId, amountGhs: 150 });
    await expect(client.mutation(api.transactions.recordPayment, { transactionId: txId, amountGhs: 61 })).rejects.toThrow("Payment exceeds");
    await client.mutation(api.transactions.markPaid, { transactionId: txId });
    const payments = await t.run(ctx => ctx.db.query("payments").collect());
    expect(payments.map(p => ({principalGhs:p.principalGhs,interestGhs:p.interestGhs,penaltyGhs:p.penaltyGhs}))).toEqual([
      {principalGhs:150,interestGhs:0,penaltyGhs:0}, {principalGhs:50,interestGhs:10,penaltyGhs:0}
    ]);
    expect(payments.every(p => !!p.branchId)).toBe(true);
  });

});
