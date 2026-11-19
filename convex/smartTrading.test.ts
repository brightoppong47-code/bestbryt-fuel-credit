import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const owner = await ctx.db.insert("users", { role: "owner", tokenIdentifier: "test|owner" });
    const branchId = await ctx.db.insert("branches", { name: "Central", code: "CTR", isActive: true, nextSequence: 1, createdBy: owner });
    const other = await ctx.db.insert("branches", { name: "Other", code: "OTH", isActive: true, nextSequence: 1, createdBy: owner });
    await ctx.db.insert("users", { role: "staff", tokenIdentifier: "test|staff", branchId });
    return { branchId, other };
  });
  const args = { ...ids, fullName: "Private Name", phone: "0244000000", address: "Private address", vehiclePlate: "REAL-123", vehicleType: "Taxi", gpsLatitude: 5, gpsLongitude: -1 };
  const { other, ...registration } = args;
  return { t, ids, registration, owner: t.withIdentity({ tokenIdentifier: "test|owner" }), staff: t.withIdentity({ tokenIdentifier: "test|staff" }) };
}
it("atomically saves a request and unique alias without issuing fuel or changing balances", async () => {
  const { t, owner, registration, ids } = await fixture();
  const id = await owner.mutation(api.drivers.registerDriver, { ...registration, requestedFuelAmountGhs: 1000.25 });
  const id2 = await owner.mutation(api.drivers.registerDriver, { ...registration, branchId: ids.other, requestedFuelAmountGhs: 200 });
  const records = await t.run(async ctx => ({ driver: await ctx.db.get(id), driver2: await ctx.db.get(id2), requests: await ctx.db.query("smart_trading_requests").collect(), credits: await ctx.db.query("transactions").collect(), payments: await ctx.db.query("payments").collect() }));
  expect(records.driver?.smartTradingCode).toBe("SMART-000001");
  expect(records.driver2?.smartTradingCode).toBe("SMART-000002");
  expect(records.requests).toHaveLength(2);
  expect(records.requests[0].requestedAmountGhs).toBe(1000.25);
  expect(records.credits).toEqual([]); expect(records.payments).toEqual([]);
  expect((await owner.query(api.drivers.getDriver, { driverId: id }))?.tradingRequest?.deliveryStatus).toBe("queued");
});
it("rejects invalid amounts before saving and preserves old registration clients", async () => {
  const { t, owner, registration } = await fixture();
  for (const requestedFuelAmountGhs of [0, -1, 1.001, Infinity, NaN, 1e20]) {
    await expect(owner.mutation(api.drivers.registerDriver, { ...registration, requestedFuelAmountGhs })).rejects.toThrow();
  }
  expect(await t.run(ctx => ctx.db.query("drivers").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("smart_trading_requests").collect())).toHaveLength(0);
  await owner.mutation(api.drivers.registerDriver, registration);
  expect(await t.run(ctx => ctx.db.query("smart_trading_requests").collect())).toHaveLength(0);
});
it("keeps registration and request visibility branch restricted", async () => {
  const { owner, staff, ids, registration } = await fixture();
  await expect(staff.mutation(api.drivers.registerDriver, { ...registration, branchId: ids.other, requestedFuelAmountGhs: 100 })).rejects.toThrow("assigned branch");
  const id = await owner.mutation(api.drivers.registerDriver, { ...registration, branchId: ids.other, requestedFuelAmountGhs: 100 });
  expect(await staff.query(api.drivers.getDriver, { driverId: id })).toBeNull();
});
it("leaves unconfigured requests queued and sends only an authenticated privacy limited event", async () => {
  const { t, owner, registration } = await fixture();
  await owner.mutation(api.drivers.registerDriver, { ...registration, requestedFuelAmountGhs: 500 });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SMART_TRADING_REQUEST_URL", ""); vi.stubEnv("SMART_TRADING_BRIDGE_SECRET", "");
  await t.action(internal.smartTrading.deliverRequests, {});
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubEnv("SMART_TRADING_REQUEST_URL", "https://smart.example/requests");
  vi.stubEnv("SMART_TRADING_BRIDGE_SECRET", "test-shared-secret");
  fetchMock.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["createdAt", "currency", "requestId", "requestedAmountGhs", "schemaVersion", "status", "tradingCode", "vehicleType"].sort());
    expect(init.headers.Authorization).toBe("Bearer test-shared-secret");
    expect(init.headers["Idempotency-Key"]).toBe(body.requestId);
    return new Response(JSON.stringify({ accepted: true, requestId: body.requestId }), { status: 200 });
  });
  await t.action(internal.smartTrading.deliverRequests, {});
  await t.action(internal.smartTrading.deliverRequests, {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await t.run(ctx => ctx.db.query("smart_trading_requests").first()))?.deliveryStatus).toBe("delivered");
});
it("retries failed acknowledgements and ignores stale worker completions", async () => {
  const { t, owner, registration } = await fixture();
  await owner.mutation(api.drivers.registerDriver, { ...registration, requestedFuelAmountGhs: 100 });
  vi.stubEnv("SMART_TRADING_REQUEST_URL", "https://smart.example/requests");
  vi.stubEnv("SMART_TRADING_BRIDGE_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accepted: true, requestId: "wrong" }))));
  await t.action(internal.smartTrading.deliverRequests, {});
  const request = (await t.run(ctx => ctx.db.query("smart_trading_requests").first()))!;
  expect(request.deliveryStatus).toBe("queued"); expect(request.lastError).toContain("acknowledge");
  expect(await t.mutation(internal.smartTrading.claimRequest, {})).toBeNull();
  await t.run(ctx => ctx.db.patch(request._id, { nextAttemptAt: Date.now() - 1 }));
  const claimed = (await t.mutation(internal.smartTrading.claimRequest, {}))!;
  await t.mutation(internal.smartTrading.finishDelivery, { requestId: request._id, attempt: 1 });
  expect((await t.run(ctx => ctx.db.get(request._id)))?.deliveryStatus).toBe("queued");
  await t.mutation(internal.smartTrading.finishDelivery, { requestId: request._id, attempt: claimed.attempts });
  expect((await t.run(ctx => ctx.db.get(request._id)))?.deliveryStatus).toBe("delivered");
});
it("connection secrets are owner-only and status never returns credentials", async () => {
  const { t, owner, staff } = await fixture();
  const config = { requestUrl: "https://smart.example.chatgpt.site/api/bridge/requests", bridgeSecret: "test-secret-".repeat(5), sitesToken: "private-service-token-".repeat(3) };
  await expect(staff.mutation(api.smartTrading.configure, config)).rejects.toThrow("owners");
  await owner.mutation(api.smartTrading.configure, config);
  expect(await owner.query(api.smartTrading.connectionStatus, {})).toEqual({ configured: true, requestUrl: config.requestUrl });
  await expect(staff.query(api.smartTrading.connectionStatus, {})).rejects.toThrow("owners");
  await expect(owner.mutation(api.smartTrading.configure, { ...config, requestUrl: "http://other.example/requests" })).rejects.toThrow();
});
it("links only the exact request to a 10% fuel issue and exports verified component totals", async () => {
  const { t, owner, registration } = await fixture();
  await t.run(ctx => ctx.db.insert("app_settings", { key: "global", interestRatePercent: 10 }));
  const driverId = await owner.mutation(api.drivers.registerDriver, { ...registration, requestedFuelAmountGhs: 500 });
  const request = (await owner.query(api.drivers.getDriver, { driverId }))!.tradingRequest!;
  await expect(owner.mutation(api.transactions.issueCredit, { driverId, fuelAmountGhs: 400, expectedInterestRatePercent: 10, smartTradingRequestId: request._id })).rejects.toThrow("match the fuel amount");
  const transactionId = await owner.mutation(api.transactions.issueCredit, { driverId, fuelAmountGhs: 500, expectedInterestRatePercent: 10, interestCollectedUpfront: true, smartTradingRequestId: request._id });
  await expect(owner.mutation(api.transactions.issueCredit, { driverId, fuelAmountGhs: 500, expectedInterestRatePercent: 10, smartTradingRequestId: request._id })).rejects.toThrow("unused");
  await t.run(async ctx => {
    await ctx.db.patch(request._id, { deliveryStatus: "delivered", nextActivityAt: Date.now() });
    const user = (await ctx.db.query("users").withIndex("by_token",q=>q.eq("tokenIdentifier","test|owner")).unique())!;
    for (const status of ["verified", "pending"] as const) await ctx.db.insert("payments", { driverId, transactionId, amountGhs: 100, principalGhs: 100, interestGhs: 0, penaltyGhs: 0, recordedBy: user._id, recordedAt: new Date().toISOString(), reconciliationStatus: status });
  });
  const event = await t.mutation(internal.smartTrading.claimActivity, {});
  expect(event?.skip).toBe(false);
  if (event && !event.skip) {
    expect(event.payload.principalPaidGhs).toBe(100);
    expect(event.payload.interestPaidGhs).toBe(50);
    expect(event.payload.penaltyPaidGhs).toBe(0);
    expect(Object.keys(event.payload).sort()).toEqual(["journey","requestId", "creditId", "principalPaidGhs", "interestPaidGhs", "penaltyPaidGhs", "dueAt"].sort());
  }
});

it("reopens a settled driver under the same code only after a fresh request",async()=>{
  const {t,owner,registration}=await fixture();
  await t.run(ctx=>ctx.db.insert("app_settings",{key:"global",interestRatePercent:10}));
  const driverId=await owner.mutation(api.drivers.registerDriver,{...registration,requestedFuelAmountGhs:200});
  const first=(await owner.query(api.drivers.getDriver,{driverId}))!.tradingRequest!;
  const again=()=>owner.mutation(api.drivers.requestFuelAgain,{driverId,amount:300});
  await expect(again()).rejects.toThrow("open fuel request");
  const transactionId=await owner.mutation(api.transactions.issueCredit,{driverId,fuelAmountGhs:200,expectedInterestRatePercent:10,smartTradingRequestId:first._id});
  await expect(again()).rejects.toThrow("principal repayment");
  await t.run(ctx=>ctx.db.insert("payments",{driverId,transactionId,recordedBy:first.createdBy,recordedAt:new Date().toISOString(),amountGhs:200,principalGhs:200,reconciliationStatus:"verified"}));
  await again();
  const next=(await owner.query(api.drivers.getDriver,{driverId}))!.tradingRequest!;
  expect(next.tradingCode).toBe(first.tradingCode);
  expect(next.requestedAmountGhs).toBe(300);
  expect(next._id).not.toBe(first._id);
  await expect(again()).rejects.toThrow("open fuel request");
});

it("exports only active accounts and trading aliases in the driver directory",async()=>{
  const {t,owner,registration}=await fixture();
  const first=await owner.mutation(api.drivers.registerDriver,registration);
  const second=await owner.mutation(api.drivers.registerDriver,registration);
  await t.run(ctx=>ctx.db.patch(second,{isActive:false}));
  const driver=await t.run(ctx=>ctx.db.get(first));
  const page=await t.query(internal.smartTrading.activeDirectoryPage,{cursor:null});
  expect(page.done).toBe(true);
  expect(page.drivers).toEqual([{account:driver!.accountNumber,code:driver!.smartTradingCode}]);
});
