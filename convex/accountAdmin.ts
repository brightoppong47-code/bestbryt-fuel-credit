import { action, internalQuery } from "./_generated/server";
import { createAccount } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireOwner } from "./helpers";
import { v } from "convex/values";

export const authorize = internalQuery({ args:{email:v.string()}, handler: async (ctx,args) => {
  await requireOwner(ctx);
  const existing=await ctx.db.query("users").withIndex("email",q=>q.eq("email",args.email)).first();
  if(existing) throw new Error("A user with this email already exists. Their existing login has not been changed.");
  return true;
} });

export const createUser = action({
  args: { email:v.string(), name:v.string(), password:v.string(), branchId:v.id("branches"),
    role:v.union(v.literal("staff"),v.literal("branch_secretary"),v.literal("risk_manager")) },
  handler: async (ctx,args): Promise<{userId:string}> => {
    await ctx.runQuery(internal.accountAdmin.authorize, {email:args.email.trim().toLowerCase()});
    if (!process.env.JWT_PRIVATE_KEY || !process.env.JWKS) throw new Error("Account creation is not activated yet. Complete the backend authentication setup first.");
    const email=args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
    if (!args.name.trim()) throw new Error("Enter the user's full name");
    if (args.password.length<12 || args.password.length>128) throw new Error("Use a password between 12 and 128 characters");
    const result=await createAccount(ctx, {provider:"password",account:{id:email,secret:args.password},
      profile:{tokenIdentifier:`local:${email}`,email,name:args.name.trim(),role:args.role,branchId:args.branchId,loginMethod:"password"},
      shouldLinkViaEmail:false,shouldLinkViaPhone:false});
    return {userId:result.user._id};
  },
});
