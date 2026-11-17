import { ConvexError, v } from "convex/values";
import { requireOwner } from "./helpers";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
  handler: async (ctx): Promise<void> => {
    const config = await ctx.runQuery(internal.smartTrading.connection, {});
    const endpoint = config?.requestUrl ?? process.env.SMART_TRADING_REQUEST_URL;
    const secret = config?.bridgeSecret ?? process.env.SMART_TRADING_BRIDGE_SECRET;
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
            "Idempotency-Key": request.requestId,
            ...(config?.sitesToken ? { "OAI-Sites-Authorization": `Bearer ${config.sitesToken}` } : {}) },
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


export const connection = internalQuery({
  args: {}, handler: async ctx => await ctx.db.query("smart_trading_connection").withIndex("by_key", q => q.eq("key", "global")).unique(),
});
export const connectionStatus = query({
  args: {}, handler: async ctx => {
    await requireOwner(ctx);
    const config = await ctx.db.query("smart_trading_connection").withIndex("by_key", q => q.eq("key", "global")).unique();
    return { configured: !!config, requestUrl: config?.requestUrl ?? null };
  },
});
export const configure = mutation({
  args: { requestUrl: v.string(), bridgeSecret: v.string(), sitesToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);
    let url: URL;
    try { url = new URL(args.requestUrl); } catch { throw new ConvexError("Invalid Smart Trading address"); }
    if (url.protocol !== "https:" || !url.hostname.endsWith(".chatgpt.site") || url.pathname !== "/api/bridge/requests" || url.search || url.hash || url.username || url.password || args.bridgeSecret.length < 32 || args.bridgeSecret.length > 500 || args.sitesToken.length < 20 || args.sitesToken.length > 4000) throw new ConvexError("Paste the complete connection settings from Smart Trading admin");
    const previous = await ctx.db.query("smart_trading_connection").withIndex("by_key", q => q.eq("key", "global")).unique();
    const values = { ...args, key: "global", updatedBy: user._id, updatedAt: new Date().toISOString() };
    if (previous) await ctx.db.patch(previous._id, values); else await ctx.db.insert("smart_trading_connection", values);
    return { configured: true };
  },
});

export const claimActivity = internalMutation({
  args: {}, handler: async ctx => {
    const request = await ctx.db.query("smart_trading_requests").withIndex("by_activity", q => q.gte("nextActivityAt", 0).lte("nextActivityAt", Date.now())).first();
    if (!request) return null;
    await ctx.db.patch(request._id, { nextActivityAt: Date.now() + 300_000 });
    if (!request.transactionId || request.deliveryStatus !== "delivered") return { skip: true as const };
    const tx = await ctx.db.get(request.transactionId);
    if (!tx) return { skip: true as const };
    const payments = await ctx.db.query("payments").withIndex("by_transaction", q => q.eq("transactionId", tx._id)).collect();
    // Only reconciled receipts move trader money. Unknown legacy allocations need owner review.
    const verified = payments.filter(p => p.reconciliationStatus === "verified");
    if (verified.some(p => p.principalGhs === undefined || p.interestGhs === undefined || p.penaltyGhs === undefined)) {
      await ctx.db.patch(request._id, { activityError: "Verified receipt has no component allocation; owner review required" });
      return { skip: true as const };
    }
    const principalPaidGhs = Math.round(verified.reduce((sum,p) => sum + (p.principalGhs ?? 0), 0) * 100) / 100;
    const interestPaidGhs = Math.round(((tx.interestCollectedUpfront ? tx.interestGhs : 0) + verified.reduce((sum,p) => sum + (p.interestGhs ?? 0), 0)) * 100) / 100;
    const penaltyPaidGhs = Math.round(verified.reduce((sum,p) => sum + (p.penaltyGhs ?? 0), 0) * 100) / 100;
    if ((tx.principalAdjustmentGhs ?? 0) !== 0 || (tx.interestAdjustmentGhs ?? 0) !== 0 || (tx.penaltyAdjustmentGhs ?? 0) !== 0) {
      await ctx.db.patch(request._id, { activityError: "Adjusted credit requires Smart Trading owner review" });
      return { skip: true as const };
    }
    const payload = { requestId: request._id, creditId: tx._id, principalPaidGhs, interestPaidGhs, penaltyPaidGhs, dueAt: tx.dueAt };
    const fingerprint = JSON.stringify(payload);
    return { skip: false as const, payload, fingerprint, previous: request.lastActivityHash };
  },
});
export const finishActivity = internalMutation({
  args: { requestId: v.id("smart_trading_requests"), fingerprint: v.string(), error: v.optional(v.string()) },
  handler: async (ctx,args) => {
    if (await ctx.db.get(args.requestId)) await ctx.db.patch(args.requestId, { ...(args.error ? {} : { lastActivityHash: args.fingerprint }), activityError: args.error });
  },
});
export const deliverActivities = internalAction({
  args: {}, handler: async (ctx): Promise<void> => {
    const config = await ctx.runQuery(internal.smartTrading.connection, {});
    if (!config) return;
    const activityUrl = new URL("/api/bridge/activity", config.requestUrl).toString();
    for (let i=0; i<20; i++) {
      const event = await ctx.runMutation(internal.smartTrading.claimActivity, {});
      if (!event) break;
      if (event.skip || event.fingerprint === event.previous) continue;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(event.fingerprint));
      const eventId = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
      let error: string | undefined;
      try {
        const response = await fetch(activityUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.bridgeSecret}`, "OAI-Sites-Authorization": `Bearer ${config.sitesToken}` }, body: JSON.stringify({ ...event.payload, eventId, sourceAt: new Date().toISOString() }) });
        const ack = response.ok ? await response.json() as {accepted?: boolean; eventId?: string} : null;
        if (!ack?.accepted || ack.eventId !== eventId) error = "Activity not acknowledged; owner review or retry pending";
      } catch { error = "Activity delivery unavailable; retry pending"; }
      await ctx.runMutation(internal.smartTrading.finishActivity, { requestId: event.payload.requestId, fingerprint: event.fingerprint, error });
    }
  },
});

// Read-only snapshot for practice accounts. Source receipt notes and customer identity stay in the fuel app.
export const demoHistory = internalQuery({
  args:{account:v.optional(v.string()),driver:v.optional(v.id("drivers"))},
  handler:async (ctx,args)=>{
    const account=args.account;
    const driver=args.driver?await ctx.db.get(args.driver):account?await ctx.db.query("drivers").withIndex("by_account_number",q=>q.eq("accountNumber",account)).unique():null;
    if(!driver)return null;
    const credits=await ctx.db.query("transactions").withIndex("by_driver",q=>q.eq("driverId",driver._id)).collect();
    const payments=await ctx.db.query("payments").withIndex("by_driver",q=>q.eq("driverId",driver._id)).collect();
    return {driver:driver._id,asOf:Date.now(),credits:credits.map(tx=>{
      const receipts=payments.filter(p=>p.transactionId===tx._id);
      const verified=receipts.filter(p=>p.reconciliationStatus==="verified");
      const principal=Math.round(verified.reduce((s,p)=>s+(p.principalGhs??0),0)*100);
      const interest=Math.round(verified.reduce((s,p)=>s+(p.interestGhs??0),tx.interestCollectedUpfront?tx.interestGhs:0)*100);
      const booked=Math.round(receipts.reduce((s,p)=>s+p.amountGhs,0)*100);
      const review=!!(tx.principalAdjustmentGhs||tx.interestAdjustmentGhs||tx.penaltyAdjustmentGhs)
        ||receipts.some(p=>p.reconciliationStatus!=="verified"||p.principalGhs===undefined||p.interestGhs===undefined||p.penaltyGhs===undefined)
        || Math.round((tx.amountPaidGhs??0)*100)!==booked;
      return {id:tx._id,issued:tx.issuedAt,due:tx.dueAt,status:tx.status,amount:Math.round(tx.fuelAmountGhs*100),principal,interestPaid:tx.interestGhs>0&&interest>=Math.round(tx.interestGhs*100),review,
        receipts:receipts.map(p=>({date:p.recordedAt,status:p.reconciliationStatus??"unverified",principal:p.principalGhs===undefined?null:Math.round(p.principalGhs*100),penalty:p.penaltyGhs===undefined?null:Math.round(p.penaltyGhs*100)}))};
    })};
  },
});
