import { afterEach, expect, it, vi } from "vitest";
vi.mock("twilio", () => ({ default: vi.fn() }));
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import { buildMessageDraft } from "./lib/messageDraft";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  vi.stubEnv("MNOTIFY_API_KEY", "test-key-never-real"); vi.stubEnv("MNOTIFY_SENDER_ID", "BESTBRYT");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", code: "2000", summary: { _id: "mock-campaign", total_sent: 1 } }) }); vi.stubGlobal("fetch", fetcher);
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const owner = await ctx.db.insert("users", { role: "owner", tokenIdentifier: "owner" });
    const a = await ctx.db.insert("branches", { name: "A", code: "A", nextSequence: 1, isActive: true, createdBy: owner });
    const b = await ctx.db.insert("branches", { name: "B", code: "B", nextSequence: 1, isActive: true, createdBy: owner });
    await ctx.db.insert("users", { role: "staff", branchId: b, tokenIdentifier: "other-staff" });
    await ctx.db.insert("users", { role: "staff", branchId: a, tokenIdentifier: "staff" });
    const driverId = await ctx.db.insert("drivers", { fullName: "Test Customer", phone: "0241234567", accountNumber: "A001", branchId: a, address: "Test", vehicleType: "Taxi", vehiclePlate: "TEST", gpsLatitude: 0, gpsLongitude: 0, sequenceNumber: 1, registeredBy: owner, isActive: true });
    await ctx.db.insert("transactions", { driverId, fuelAmountGhs: 100, interestGhs: 5, totalOwedGhs: 100, penaltyGhs: 0, amountPaidGhs: 0, issuedAt: new Date().toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString(), status: "pending", issuedBy: owner });
    return { driverId };
  });
  const customer = { fullName: "Test Customer", accountNumber: "A001" };
  const args = { driverId: ids.driverId, kind: "balance" as const, expectedBody: buildMessageDraft(customer, "balance", "", 100)!, expectedPhone: "0241234567", requestId: "mock-request-000000001" };
  return { t, fetcher, args, customer };
}
it("submits once per request and audits provider ID without confirming delivery", async () => {
  const { t, fetcher, args } = await setup(); const client = t.withIdentity({ tokenIdentifier: "owner" });
  expect(await client.action(api.messaging.sendCustomerSms, args)).toMatchObject({ success: true, status: "submitted" });
  expect(await client.action(api.messaging.sendCustomerSms, args)).toMatchObject({ success: true, status: "submitted" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const logs = await t.run(ctx => ctx.db.query("message_logs").collect());
  expect(logs).toHaveLength(1); expect(logs[0]).toMatchObject({ provider: "mnotify", providerId: "mock-campaign", submissionStatus: "submitted" });
});
it("rejects cross-branch, unauthenticated, staff announcements and stale previews before sending", async () => {
  const { t, fetcher, args, customer } = await setup();
  await expect(t.action(api.messaging.sendCustomerSms, args)).rejects.toThrow();
  await expect(t.withIdentity({ tokenIdentifier: "other-staff" }).action(api.messaging.sendCustomerSms, args)).rejects.toThrow();
  await expect(t.withIdentity({ tokenIdentifier: "staff" }).action(api.messaging.sendCustomerSms, { ...args, kind: "general", generalMessage: "Test", expectedBody: buildMessageDraft(customer, "general", "Test")! })).rejects.toThrow("Only admin");
  await expect(t.withIdentity({ tokenIdentifier: "owner" }).action(api.messaging.sendCustomerSms, { ...args, expectedBody: "Wrong balance" })).rejects.toThrow("changed");
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not retry an unknown provider outcome", async () => {
  const { t, fetcher, args } = await setup(); fetcher.mockRejectedValue(new Error("Test timeout")); const client = t.withIdentity({ tokenIdentifier: "owner" });
  expect((await client.action(api.messaging.sendCustomerSms, args)).status).toBe("unknown");
  expect((await client.action(api.messaging.sendCustomerSms, args)).status).toBe("unknown");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
