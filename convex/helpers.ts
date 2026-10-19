import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type UserRole = "owner" | "staff" | "branch_secretary" | "risk_manager";

export async function findCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  if (process.env.CONVEX_SITE_URL && identity.issuer === process.env.CONVEX_SITE_URL) {
    const id = await getAuthUserId(ctx);
    const validId = id ? ctx.db.normalizeId("users", id) : null;
    return validId ? await ctx.db.get(validId) : null;
  }
  return await ctx.db.query("users").withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
}
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await findCurrentUser(ctx);
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

import type { Doc, Id } from "./_generated/dataModel";
/** All non-admin staff are always branch-scoped, including when unassigned. */
export function isBranchStaff(user: Doc<"users">) {
  return user.role !== "owner";
}
export function assignedBranchIds(user: Doc<"users">): Id<"branches">[] {
  return [...new Set(user.role === "risk_manager" && user.branchIds !== undefined
    ? user.branchIds : user.branchId ? [user.branchId] : [])];
}
export async function validateBranchAssignments(ctx: QueryCtx | MutationCtx, role: UserRole, branchId?: Id<"branches">, branchIds?: Id<"branches">[]) {
  const ids = [...new Set(role === "risk_manager" ? branchIds ?? (branchId ? [branchId] : []) : branchId ? [branchId] : [])];
  if (ids.length > 50) throw new ConvexError({message:"Choose at most 50 branches",code:"BAD_REQUEST"});
  for (const id of ids) if (!(await ctx.db.get("branches", id))?.isActive) throw new ConvexError({message:"Choose an active branch",code:"BAD_REQUEST"});
  return {branchId: role === "owner" ? undefined : ids[0], branchIds:role === "risk_manager" ? ids : undefined};
}
export function canAccessBranch(user: Doc<"users">, branchId: Id<"branches"> | undefined) {
  return !isBranchStaff(user) || (!!branchId && assignedBranchIds(user).includes(branchId));
}
export function assertBranchAccess(user: Doc<"users">, branchId: Id<"branches"> | undefined) {
  if (!canAccessBranch(user, branchId)) throw new ConvexError({message:"Access is restricted to your assigned branch. Ask admin to assign your branch if needed.",code:"FORBIDDEN"});
}
export async function assertDriverAccess(ctx: QueryCtx | MutationCtx, user: Doc<"users">, driverId: Id<"drivers">) {
  const driver = await ctx.db.get(driverId);
  if (!driver) throw new ConvexError({message:"Customer not found",code:"NOT_FOUND"});
  assertBranchAccess(user, driver.branchId);
  return driver;
}
export async function assertTransactionAccess(ctx: QueryCtx | MutationCtx, user: Doc<"users">, transactionId: Id<"transactions">) {
  const tx = await ctx.db.get(transactionId);
  if (!tx) throw new ConvexError({message:"Credit not found",code:"NOT_FOUND"});
  await assertDriverAccess(ctx, user, tx.driverId);
  return tx;
}
export async function accessibleDriverIds(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  if (!isBranchStaff(user)) return null;
  const drivers = (await Promise.all(assignedBranchIds(user).map(branchId =>
    ctx.db.query("drivers").withIndex("by_branch", q => q.eq("branchId", branchId)).collect()))).flat();
  return new Set(drivers.map(d=>d._id));
}
