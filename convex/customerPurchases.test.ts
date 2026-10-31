import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const owner = await ctx.db.insert("users", { role: "owner", tokenIdentifier: "owner" });
    const a = await ctx.db.insert("branches", { name: "A", code: "A", isActive: true, nextSequence: 1, createdBy: owner });
    const b = await ctx.db.insert("branches", { name: "B", code: "B", isActive: true, nextSequence: 1, createdBy: owner });
    const staff = await ctx.db.insert("users", { role: "staff", branchId: a, tokenIdentifier: "staff" });
    await ctx.db.insert("users", { role: "staff", tokenIdentifier: "unassigned" });
    const base = { fullName: "Customer", phone: "000", address: "Test", vehicleType: "Taxi", vehiclePlate: "TEST", gpsLatitude: 0, gpsLongitude: 0, sequenceNumber: 1, isActive: true, registeredBy: owner };
    const customerA = await ctx.db.insert("drivers", { ...base, branchId: a, accountNumber: "A001" });
    const customerB = await ctx.db.insert("drivers", { ...base, branchId: b, accountNumber: "B001" });
    const bill = { fuelAmountGhs: 100, interestGhs: 5, interestCollectedUpfront: true, totalOwedGhs: 100, dueAt: "2026-11-01T00:00:00Z", status: "pending" as const, penaltyGhs: 10, amountPaidGhs: 30, issuedBy: staff };
    const tx = await ctx.db.insert("transactions", { ...bill, driverId: customerA, issuedAt: "2026-10-01T00:00:00Z" });
    await ctx.db.insert("transactions", { ...bill, driverId: customerA, issuedAt: "2026-10-31T23:59:59.999Z", status: "paid" });
    await ctx.db.insert("transactions", { ...bill, driverId: customerB, issuedAt: "2026-10-10T10:00:00Z" });
    for (const issuedAt of ["2026-09-30T23:59:59.999Z", "2026-11-01T00:00:00Z"]) await ctx.db.insert("transactions", { ...bill, driverId: customerA, issuedAt });
    for (let n = 0; n < 2; n++) await ctx.db.insert("payments", { transactionId: tx, driverId: customerA, amountGhs: 15, recordedBy: staff, recordedAt: "2026-10-10T12:00:00Z" });
    return { a, b };
  });
  return { t, ids, args: { fromDate: "2026-10-01", toDate: "2026-10-31" } };
}
describe("customer purchases report", () => {
  it("includes both boundary dates, counts bills once and returns recorded amounts", async () => {
    const { t, ids, args } = await setup();
    const bills = await t.withIdentity({ tokenIdentifier: "owner" }).query(api.exports.customerPurchases, { ...args, branchId: ids.a });
    expect(bills).toHaveLength(2);
    expect(bills.find(b => b.status === "pending")).toMatchObject({ fuelGhs: 100, interestGhs: 5, upfrontInterestGhs: 5, repaymentsGhs: 30, recordedPenaltyGhs: 10, recordedBalanceGhs: 80 });
    expect(bills.find(b => b.status === "paid")?.recordedBalanceGhs).toBe(0);
  });
  it("enforces branch scope with and without a requested branch", async () => {
    const { t, ids, args } = await setup();
    const staff = t.withIdentity({ tokenIdentifier: "staff" });
    expect(await staff.query(api.exports.customerPurchases, args)).toHaveLength(2);
    await expect(staff.query(api.exports.customerPurchases, { ...args, branchId: ids.b })).rejects.toThrow("assigned branch");
    expect(await t.withIdentity({ tokenIdentifier: "unassigned" }).query(api.exports.customerPurchases, args)).toEqual([]);
    expect(await t.withIdentity({ tokenIdentifier: "owner" }).query(api.exports.customerPurchases, args)).toHaveLength(3);
    await expect(t.query(api.exports.customerPurchases, args)).rejects.toThrow("authenticated");
  });
  it("rejects reversed ranges and impossible calendar dates", async () => {
    const { t, args } = await setup(); const client = t.withIdentity({ tokenIdentifier: "owner" });
    await expect(client.query(api.exports.customerPurchases, { ...args, fromDate: "2026-11-01" })).rejects.toThrow("valid date range");
    await expect(client.query(api.exports.customerPurchases, { ...args, fromDate: "2026-02-30" })).rejects.toThrow("valid date range");
  });
});
