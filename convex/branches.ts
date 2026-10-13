import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner, requireStaff } from "./helpers";

export const createBranch = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);
    // Validate: code must be 2-5 uppercase letters
    const code = args.code.toUpperCase().trim();
    if (!/^[A-Z]{2,5}$/.test(code)) {
      throw new ConvexError({ message: "Branch code must be 2–5 letters (e.g. KMS, ACC)", code: "BAD_REQUEST" });
    }
    // Check uniqueness
    const existing = await ctx.db
      .query("branches")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing) {
      throw new ConvexError({ message: `Branch code "${code}" is already taken`, code: "CONFLICT" });
    }
    return await ctx.db.insert("branches", {
      name: args.name,
      code,
      location: args.location,
      isActive: true,
      nextSequence: 1,
      createdBy: user._id,
    });
  },
});

export const listBranches = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db.query("branches").collect();
  },
});

export const getBranch = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db.get(args.branchId);
  },
});

export const updateBranch = mutation({
  args: {
    branchId: v.id("branches"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const { branchId, ...updates } = args;
    await ctx.db.patch(branchId, updates);
  },
});
