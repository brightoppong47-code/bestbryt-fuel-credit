import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Claims are atomic; overlapping workers cannot normally send the same event.
// A crashed worker's lease expires, so the receiver MUST deduplicate requestId.
export const claimRequest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const request = await ctx.db.query("smart_trading_requests")
      .withIndex("by_delivery", q => q.eq("deliveryStatus", "queued").lte("nextAttemptAt", now))
      .first();
    if (!request) return null;
    const attempts = request.attempts + 1;
    await ctx.db.patch(request._id, { attempts, nextAttemptAt: now + 60_000 });
    return { requestId: request._id, tradingCode: request.tradingCode,
      vehicleType: request.vehicleType, requestedAmountGhs: request.requestedAmountGhs,
      createdAt: request.createdAt, attempts };
  },
});

export const finishDelivery = internalMutation({
  args: { requestId: v.id("smart_trading_requests"), attempt: v.number(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.deliveryStatus === "delivered" || request.attempts !== args.attempt) return;
    if (args.error) {
      await ctx.db.patch(request._id, {
        lastError: args.error,
        nextAttemptAt: Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(args.attempt, 6)),
      });
    } else {
      await ctx.db.patch(request._id, {
        deliveryStatus: "delivered", deliveredAt: new Date().toISOString(), lastError: undefined,
      });
    }
  },
});

export const deliverRequests = internalAction({
  args: {},
  handler: async (ctx) => {
    const endpoint = process.env.SMART_TRADING_REQUEST_URL;
    const secret = process.env.SMART_TRADING_BRIDGE_SECRET;
    // Leave requests durably queued until the separate Smart Trading receiver exists.
    if (!endpoint || !secret) return;
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("Smart Trading receiver must use HTTPS without embedded credentials or a fragment");
    }
    for (let i = 0; i < 20; i++) {
      const request = await ctx.runMutation(internal.smartTrading.claimRequest, {});
      if (!request) break;
      let error: string | undefined;
      try {
        const { attempts: _attempts, ...payload } = request;
        const response = await fetch(url.toString(), {
          method: "POST", redirect: "error",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`,
            "Idempotency-Key": request.requestId },
          body: JSON.stringify({ ...payload, schemaVersion: 1, currency: "GHS", status: "awaiting_admin_selection" }),
          signal: AbortSignal.timeout(10_000),
        });
        // Acknowledge this exact event only after it has been durably saved by the receiver.
        const ack = response.ok ? await response.json() as { accepted?: boolean; requestId?: string } : null;
        if (!response.ok || ack?.accepted !== true || ack.requestId !== request.requestId) {
          error = `Receiver did not acknowledge request (HTTP ${response.status})`;
        }
      } catch {
        // Do not retain response bodies, URLs, secrets or potentially sensitive network errors.
        error = "Delivery unavailable; automatic retry pending";
      }
      await ctx.runMutation(internal.smartTrading.finishDelivery, {
        requestId: request.requestId, attempt: request.attempts, error,
      });
    }
  },
});
