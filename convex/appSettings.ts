/**
 * Global app settings — logo and other org-wide preferences.
 * The settings document uses key="global" as a singleton.
 */
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOwner, requireStaff } from "./helpers";

const SETTINGS_KEY = "global";

/** Get the app logo URL — readable by any authenticated user */
export const getAppSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const doc = await ctx.db
      .query("app_settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (!doc) return { logoUrl: null, interestRatePercent: 5, branchFilteringEnabled: true, accountCreationEnabled: !!process.env.JWT_PRIVATE_KEY && !!process.env.JWKS };
    const logoUrl = doc.logoStorageId
      ? await ctx.storage.getUrl(doc.logoStorageId)
      : null;
    return { logoUrl, interestRatePercent: doc.interestRatePercent ?? 5, branchFilteringEnabled: true, accountCreationEnabled: !!process.env.JWT_PRIVATE_KEY && !!process.env.JWKS };
  },
});

/** Generate an upload URL for the logo — owner only */
export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save the uploaded logo storage ID — owner only */
export const saveLogoStorageId = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const existing = await ctx.db
      .query("app_settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch("app_settings", existing._id, { logoStorageId: args.storageId });
    } else {
      await ctx.db.insert("app_settings", { key: SETTINGS_KEY, logoStorageId: args.storageId });
    }
  },
});

/** Remove the logo — owner only */
export const removeLogo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const existing = await ctx.db
      .query("app_settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch("app_settings", existing._id, { logoStorageId: undefined });
    }
  },
});

export async function readInterestRatePercent(ctx: QueryCtx | MutationCtx) {
  const settings = await ctx.db.query("app_settings").withIndex("by_key", q => q.eq("key", SETTINGS_KEY)).unique();
  return settings?.interestRatePercent ?? 5;
}

export const setInterestRate = mutation({
  args: { interestRatePercent: v.number() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (!Number.isFinite(args.interestRatePercent) || args.interestRatePercent < 0) throw new Error("Enter a valid percentage of zero or greater");
    const existing = await ctx.db.query("app_settings").withIndex("by_key", q => q.eq("key", SETTINGS_KEY)).unique();
    if (existing) await ctx.db.patch(existing._id, { interestRatePercent: args.interestRatePercent });
    else await ctx.db.insert("app_settings", { key: SETTINGS_KEY, interestRatePercent: args.interestRatePercent });
  },
});
