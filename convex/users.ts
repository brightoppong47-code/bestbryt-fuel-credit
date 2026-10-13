import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./helpers";

type Role = "owner" | "staff" | "branch_secretary" | "risk_manager";

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name,
        email: identity.email,
      });
      return existing._id;
    }

    // Check if admin pre-assigned a role for this email
    const email = (identity.email ?? "").toLowerCase().trim();
    let assignedRole: Role = "staff";

    if (email) {
      const invite = await ctx.db
        .query("invited_users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();

      if (invite && !invite.acceptedAt) {
        assignedRole = invite.role as Role;
        // Mark invite as accepted
        await ctx.db.patch(invite._id, {
          acceptedAt: new Date().toISOString(),
        });
      }
    }

    // First user ever becomes owner regardless
    const existingCount = await ctx.db.query("users").take(1);
    const role: Role = existingCount.length === 0 ? "owner" : assignedRole;

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
      role,
    });

    // Patch invite with the new userId
    if (email) {
      const invite = await ctx.db
        .query("invited_users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (invite && invite.acceptedAt && !invite.acceptedByUserId) {
        await ctx.db.patch(invite._id, { acceptedByUserId: userId });
      }
    }

    return userId;
  },
});

export const getCurrentUserData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can view staff", code: "FORBIDDEN" });
    }
    return await ctx.db.query("users").collect();
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("staff"),
      v.literal("branch_secretary"),
      v.literal("risk_manager"),
    ),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can change roles", code: "FORBIDDEN" });
    }
    if (args.userId === user._id && args.role !== "owner") {
      throw new ConvexError({
        message: "You cannot remove your own owner role",
        code: "FORBIDDEN",
      });
    }
    await ctx.db.patch(args.userId, {
      role: args.role,
      branchId: args.branchId,
    });
  },
});

// ─── Invite management ───────────────────────────────────────────────────────

export const createInvite = mutation({
  args: {
    email: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("staff"),
      v.literal("branch_secretary"),
      v.literal("risk_manager"),
    ),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    if (currentUser.role !== "owner") {
      throw new ConvexError({ message: "Only owners can create users", code: "FORBIDDEN" });
    }

    const email = args.email.toLowerCase().trim();
    if (!email.includes("@")) {
      throw new ConvexError({ message: "Invalid email address", code: "BAD_REQUEST" });
    }

    // Check not already an active user
    const allUsers = await ctx.db.query("users").collect();
    const alreadyUser = allUsers.find((u) => (u.email ?? "").toLowerCase() === email);
    if (alreadyUser) {
      throw new ConvexError({
        message: "A user with this email already exists in the system",
        code: "CONFLICT",
      });
    }

    // Check for duplicate pending invite
    const existingInvite = await ctx.db
      .query("invited_users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingInvite && !existingInvite.acceptedAt) {
      throw new ConvexError({
        message: "An invite for this email already exists",
        code: "CONFLICT",
      });
    }

    // If there's an old accepted invite, delete it before creating a new one
    if (existingInvite) {
      await ctx.db.delete(existingInvite._id);
    }

    await ctx.db.insert("invited_users", {
      email,
      role: args.role,
      name: args.name?.trim() || undefined,
      createdBy: currentUser._id,
      createdAt: new Date().toISOString(),
    });
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can view invites", code: "FORBIDDEN" });
    }
    const invites = await ctx.db.query("invited_users").order("desc").collect();
    return invites;
  },
});

export const deleteInvite = mutation({
  args: { inviteId: v.id("invited_users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can delete invites", code: "FORBIDDEN" });
    }
    await ctx.db.delete(args.inviteId);
  },
});

export const updateInviteRole = mutation({
  args: {
    inviteId: v.id("invited_users"),
    role: v.union(
      v.literal("owner"),
      v.literal("staff"),
      v.literal("branch_secretary"),
      v.literal("risk_manager"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can update invites", code: "FORBIDDEN" });
    }
    await ctx.db.patch(args.inviteId, { role: args.role });
  },
});
