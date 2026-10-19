import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { convexTest } from "convex-test";
import { generateKeyPair, exportJWK, exportPKCS8 } from "jose";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

beforeAll(async()=>{
 const pair=await generateKeyPair("RS256",{extractable:true});
 vi.stubEnv("JWT_PRIVATE_KEY",await exportPKCS8(pair.privateKey));
 vi.stubEnv("JWKS",JSON.stringify({keys:[await exportJWK(pair.publicKey)]}));
 vi.stubEnv("CONVEX_SITE_URL","https://example.convex.site");
});
afterAll(()=>vi.unstubAllEnvs());
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"legacy|admin",email:"admin@example.com"});
  const branchId=await ctx.db.insert("branches",{name:"Main",code:"M",isActive:true,nextSequence:1,createdBy:owner});
  const inactive=await ctx.db.insert("branches",{name:"Closed",code:"C",isActive:false,nextSequence:1,createdBy:owner});
  await ctx.db.insert("users",{role:"staff",tokenIdentifier:"legacy|staff",branchId});
  return {branchId,inactive,owner};
 });
 const args={email:"new@example.com",name:"New Staff",password:"Test-only-password-928!",role:"branch_secretary" as const,branchId:ids.branchId};
 return {t,ids,args,admin:t.withIdentity({tokenIdentifier:"legacy|admin"}),staff:t.withIdentity({tokenIdentifier:"legacy|staff"})};
}
it("only admin can create accounts; public self-signup is disabled",async()=>{
 const {t,staff,args}=await fixture();
 await expect(staff.action(api.accountAdmin.createUser,args)).rejects.toThrow("Only owners");
 await expect(t.action(api.accountAdmin.createUser,args)).rejects.toThrow("Not authenticated");
 await expect(t.action(api.auth.signIn,{provider:"password",params:{email:args.email,password:args.password,flow:"signUp"}})).rejects.toThrow("Only admin");
});
it("admin creates a branch-bound account with a hashed password and a working login",async()=>{
 const {t,admin,args,ids}=await fixture();
 await t.run(async ctx=>{await ctx.db.insert("invited_users",{email:args.email,role:args.role,name:args.name,createdBy:ids.owner,createdAt:new Date().toISOString()});});
 const created=await admin.action(api.accountAdmin.createUser,args);
 const records=await t.run(async ctx=>({users:await ctx.db.query("users").collect(),accounts:await ctx.db.query("authAccounts").collect()}));
 const user=records.users.find(u=>u._id===created.userId)!;
 expect(user.role).toBe("branch_secretary");expect(user.branchId).toBe(args.branchId);
 expect(records.accounts).toHaveLength(1);expect(records.accounts[0].secret).toBeTruthy();expect(records.accounts[0].secret).not.toBe(args.password);
 const signed=await t.action(api.auth.signIn,{provider:"password",params:{email:args.email,password:args.password,flow:"signIn"}});
 expect(signed.tokens?.token).toBeTruthy();
 await expect(t.action(api.auth.signIn,{provider:"password",params:{email:args.email,password:"Incorrect-test-password",flow:"signIn"}})).rejects.toThrow();
 await expect(admin.action(api.accountAdmin.createUser,args)).rejects.toThrow("already exists");
 expect(await t.run(async ctx=>(await ctx.db.query("invited_users").first())?.acceptedByUserId)).toBe(created.userId);
 const session=await t.run(async ctx=>(await ctx.db.query("authSessions").collect())[0]);
 const native=t.withIdentity({issuer:"https://example.convex.site",subject:`${created.userId}|${session._id}`});
 expect((await native.query(api.users.getCurrentUserData,{}))?._id).toBe(created.userId);
 expect((await native.query(api.branches.listBranches,{})).map(b=>b._id)).toEqual([args.branchId]);
 expect((await admin.query(api.users.getCurrentUserData,{}))?.role).toBe("owner");
});
it("rejects inactive branches, weak passwords and existing legacy emails",async()=>{
 const {admin,args,ids}=await fixture();
 await expect(admin.action(api.accountAdmin.createUser,{...args,branchId:ids.inactive})).rejects.toThrow("active branch");
 await expect(admin.action(api.accountAdmin.createUser,{...args,password:"short"})).rejects.toThrow("12 and 128");
 await expect(admin.action(api.accountAdmin.createUser,{...args,email:"admin@example.com"})).rejects.toThrow("already exists");
});
