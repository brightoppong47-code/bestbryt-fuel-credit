import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { requireOwner } from "./helpers";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      if (params.flow !== "signIn") throw new Error("Only admin can create accounts. Ask your admin for login details.");
      return { email: String(params.email ?? "").trim().toLowerCase() };
    },
  })],
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    async createOrUpdateUser(rawCtx, args) {
      const ctx = rawCtx as MutationCtx;
      await requireOwner(ctx);
      const profile = args.profile;
      const email = String(profile.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) throw new Error("Enter a valid email address");
      const existing = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).first();
      if (existing) throw new Error("A user with this email already exists. Their existing login has not been changed.");
      const role = profile.role;
      if (role !== "staff" && role !== "branch_secretary" && role !== "risk_manager") throw new Error("Choose a staff role");
      const branchId = ctx.db.normalizeId("branches", String(profile.branchId ?? ""));
      const branch = branchId ? await ctx.db.get("branches", branchId) : null;
      if (!branchId || !branch?.isActive) throw new Error("Choose an active branch");
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: `local:${email}`, email, name: String(profile.name ?? "").trim(), role, branchId,
        loginMethod: "password",
      });
      const invites = await ctx.db.query("invited_users").withIndex("by_email", q => q.eq("email", email)).collect();
      for (const invite of invites) if (!invite.acceptedAt) await ctx.db.patch("invited_users", invite._id, {acceptedAt: new Date().toISOString(), acceptedByUserId:userId});
      return userId;
    },
  },
});
