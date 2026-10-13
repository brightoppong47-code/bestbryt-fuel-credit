import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type UserRole = "owner" | "staff" | "branch_secretary" | "risk_manager";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) {
    throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  }
  return user;
}

/** Any authenticated app user (all roles) */
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  const allowed: UserRole[] = ["owner", "staff", "branch_secretary", "risk_manager"];
  if (!allowed.includes(user.role as UserRole)) {
    throw new ConvexError({ message: "Access denied", code: "FORBIDDEN" });
  }
  return user;
}

/** Owner only */
export async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "owner") {
    throw new ConvexError({ message: "Only owners can perform this action", code: "FORBIDDEN" });
  }
  return user;
}

/** Owner or Risk Manager */
export async function requireRiskManagerOrOwner(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role !== "owner" && user.role !== "risk_manager") {
    throw new ConvexError({ message: "Risk Manager access required", code: "FORBIDDEN" });
  }
  return user;
}
