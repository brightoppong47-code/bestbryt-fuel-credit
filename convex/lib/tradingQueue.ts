import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export async function nextTradingCode(ctx: MutationCtx) {
    const counter = await ctx.db.query("smart_trading_counters")
      .withIndex("by_key", q => q.eq("key", "driver")).unique();
    const tradingSequence = counter?.nextSequence ?? 1;
    if (counter) await ctx.db.patch(counter._id, { nextSequence: tradingSequence + 1 });
    else await ctx.db.insert("smart_trading_counters", { key: "driver", nextSequence: tradingSequence + 1 });
    return `SMART-${String(tradingSequence).padStart(6, "0")}`;
}
export async function queueRequest(ctx: MutationCtx, driverId: Id<"drivers">, tradingCode: string, branchId: Id<"branches">,
  vehicleType: string, requestedAmount: number, createdBy: Id<"users">, routing: {previousRequestId?:Id<"smart_trading_requests">,previousCreditId?:Id<"transactions">,afterDriverPause?:boolean} = {}) {
      const id = await ctx.db.insert("smart_trading_requests", {
        ...routing, driverId, tradingCode, branchId: branchId, vehicleType: vehicleType,
        requestedAmountGhs: Math.round(requestedAmount * 100) / 100,
        createdBy: createdBy, createdAt: new Date().toISOString(),
        deliveryStatus: "queued", nextAttemptAt: Date.now(), attempts: 0,
      });
      const connection = await ctx.db.query("smart_trading_connection").withIndex("by_key", q => q.eq("key", "global")).unique();
      if (connection || (process.env.SMART_TRADING_REQUEST_URL && process.env.SMART_TRADING_BRIDGE_SECRET)) await ctx.scheduler.runAfter(0, internal.smartTrading.deliverRequests, {});
      return id;
}

export async function wakeTradingPayment(ctx: MutationCtx, transactionId: Id<"transactions">) {
  const request = await ctx.db.query("smart_trading_requests")
    .withIndex("by_transaction", q => q.eq("transactionId", transactionId)).unique();
  if (!request) return;
  await ctx.db.patch(request._id, { nextActivityAt: Date.now() });
  if (request.deliveryStatus === "delivered") {
    await ctx.scheduler.runAfter(0, internal.smartTrading.deliverActivities, {});
  }
}
