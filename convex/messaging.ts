"use node";

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import Twilio from "twilio";

// ─── Twilio helpers ───────────────────────────────────────────────────────────

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new ConvexError({
      message:
        "Twilio is not configured. Ask your admin to add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the Secrets tab.",
      code: "BAD_REQUEST",
    });
  }
  return Twilio(sid, token);
}

function getSender(channel: "sms" | "whatsapp"): string {
  if (channel === "whatsapp") {
    const num = process.env.TWILIO_WHATSAPP_FROM;
    if (!num)
      throw new ConvexError({ message: "TWILIO_WHATSAPP_FROM secret not configured.", code: "BAD_REQUEST" });
    return `whatsapp:${num}`;
  }
  const num = process.env.TWILIO_SMS_FROM;
  if (!num)
    throw new ConvexError({ message: "TWILIO_SMS_FROM secret not configured.", code: "BAD_REQUEST" });
  return num;
}

/** Normalise a Ghana phone number to E.164 format (+233...) */
function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/\s/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return `+233${digits}`;
}

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sendTwilioMessage(
  to: string,
  body: string,
  channel: "sms" | "whatsapp",
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getTwilioClient();
  const from = getSender(channel);
  const toFormatted = channel === "whatsapp" ? `whatsapp:${to}` : to;
  try {
    const msg = await client.messages.create({ to: toFormatted, from, body });
    return { success: true, sid: msg.sid };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Public action: send alert for a specific transaction ─────────────────────

export const sendTransactionAlert = action({
  args: {
    transactionId: v.id("transactions"),
    channel: v.union(v.literal("sms"), v.literal("whatsapp")),
    messageType: v.union(
      v.literal("balance_due"),
      v.literal("payment_received"),
      v.literal("overdue_notice"),
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sid?: string; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    await ctx.runQuery(api.transactions.getPayments, {transactionId: args.transactionId});
    const data = await ctx.runQuery(internal.messaging_internal.getTransactionForMessage, {
      transactionId: args.transactionId,
    });

    if (!data) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });
    if (!data.phone) throw new ConvexError({ message: "Driver has no phone number on file.", code: "BAD_REQUEST" });

    const to = normalisePhone(data.phone);
    const company = "BESTBRYT VENTURES";

    let body: string;
    if (args.messageType === "balance_due") {
      body = `${company}\nDear ${data.driverName}, your fuel credit of GHS ${fmt(data.totalOwed)} (Account: ${data.accountNumber}) is due. Please make your payment promptly to avoid penalties. Thank you.`;
    } else if (args.messageType === "payment_received") {
      body = `${company}\nDear ${data.driverName}, we have received your payment. Your remaining balance is GHS ${fmt(data.remaining)} (Account: ${data.accountNumber}). Thank you!`;
    } else {
      body = `${company}\nDear ${data.driverName}, your account (${data.accountNumber}) is OVERDUE by ${data.overdueDays} day${data.overdueDays !== 1 ? "s" : ""}. Total now due: GHS ${fmt(data.totalOwed)} (includes penalty). Please pay immediately. Contact us for assistance.`;
    }

    const result = await sendTwilioMessage(to, body, args.channel);

    await ctx.runMutation(internal.messaging_internal.logMessage, {
      transactionId: args.transactionId,
      driverId: data.driverId,
      phone: to,
      channel: args.channel,
      messageType: args.messageType,
      body,
      success: result.success,
      error: result.error,
    });

    return result;
  },
});

// ─── Public action: broadcast to all (or one branch's) active drivers ─────────

export const sendBroadcast = action({
  args: {
    message: v.string(),
    channel: v.union(v.literal("sms"), v.literal("whatsapp")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args): Promise<{ sent: number; failed: number; errors: string[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.runQuery(api.users.getCurrentUserData, {});
    if (!user || user.role !== "owner") throw new ConvexError({message:"Only admin can send broadcasts",code:"FORBIDDEN"});
    const drivers = await ctx.runQuery(internal.messaging_internal.getActiveDriversForBroadcast, {
      branchId: args.branchId,
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const company = "BESTBRYT VENTURES";
    const fullMessage = `${company}\n${args.message}`;

    for (const driver of drivers) {
      if (!driver.phone) { failed++; continue; }
      const to = normalisePhone(driver.phone);
      const result = await sendTwilioMessage(to, fullMessage, args.channel);

      await ctx.runMutation(internal.messaging_internal.logMessage, {
        driverId: driver._id,
        phone: to,
        channel: args.channel,
        messageType: "broadcast",
        body: fullMessage,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${driver.fullName} (${to}): ${result.error ?? "Unknown error"}`);
      }
    }

    return { sent, failed, errors };
  },
});
