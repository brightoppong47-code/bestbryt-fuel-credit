import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

async function fixture() {
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"test|owner"});
    await ctx.db.insert("users",{role:"staff",tokenIdentifier:"test|staff"});
    const branchId=await ctx.db.insert("branches",{name:"Test",code:"T",isActive:true,nextSequence:2,createdBy:owner});
    const driverId=await ctx.db.insert("drivers",{fullName:"Test customer",phone:"000",address:"Test",vehicleType:"Taxi",vehiclePlate:"TEST",gpsLatitude:0,gpsLongitude:0,branchId,accountNumber:"T1",sequenceNumber:1,isActive:true,registeredBy:owner});
    const transactionId=await ctx.db.insert("transactions",{driverId,fuelAmountGhs:200,interestGhs:10,interestCollectedUpfront:true,totalOwedGhs:200,penaltyGhs:0,issuedAt:"2099-01-01T00:00:00.000Z",dueAt:"2099-01-02T00:00:00.000Z",status:"paid",amountPaidGhs:200,paidAt:"2099-01-01T01:00:00.000Z",paidBy:owner,issuedBy:owner});
    const paymentId=await ctx.db.insert("payments",{transactionId,driverId,amountGhs:200,recordedAt:"2099-01-01T01:00:00.000Z",recordedBy:owner});
    return {driverId,transactionId,paymentId};
  });
  return {t,ids,owner:t.withIdentity({tokenIdentifier:"test|owner"}),staff:t.withIdentity({tokenIdentifier:"test|staff"})};
}
it("rejects agent corrections and direct deletion",async()=>{
  const {t,ids,staff}=await fixture();
  const expected=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.paymentId)));
  await expect(staff.query(api.admin.listCorrectionEntries,{table:"payments",paginationOpts:{numItems:25,cursor:null}})).rejects.toThrow();
  await expect(staff.mutation(api.admin.correctEntry,{table:"payments",id:ids.paymentId,expected,changes:'{"amountGhs":100}'})).rejects.toThrow();
  await expect(staff.mutation(api.admin.deleteCorrectionEntry,{table:"payments",id:ids.paymentId,expected})).rejects.toThrow();
});
it("corrects a payment, reopens credit and rejects stale overwrites",async()=>{
  const {t,ids,owner}=await fixture();
  const expected=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.paymentId)));
  await owner.mutation(api.admin.correctEntry,{table:"payments",id:ids.paymentId,expected,changes:'{"amountGhs":100}'});
  const tx=await t.run(ctx=>ctx.db.get(ids.transactionId));
  expect(tx).toMatchObject({amountPaidGhs:100,status:"pending"});
  expect(tx?.paidAt).toBeUndefined();
  await expect(owner.mutation(api.admin.correctEntry,{table:"payments",id:ids.paymentId,expected,changes:'{"amountGhs":90}'})).rejects.toThrow("changed");
});
it("deletes payment and updates balances; protects linked customers",async()=>{
  const {t,ids,owner}=await fixture();
  const driver=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.driverId)));
  await expect(owner.mutation(api.admin.deleteCorrectionEntry,{table:"drivers",id:ids.driverId,expected:driver})).rejects.toThrow("incorrect credits");
  const expected=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.paymentId)));
  await owner.mutation(api.admin.deleteCorrectionEntry,{table:"payments",id:ids.paymentId,expected});
  expect(await t.run(ctx=>ctx.db.get(ids.transactionId))).toMatchObject({amountPaidGhs:0,status:"pending"});
});
it("rolls back overpayments and cascades credit deletion",async()=>{
  const {t,ids,owner}=await fixture();
  const payment=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.paymentId)));
  await expect(owner.mutation(api.admin.correctEntry,{table:"payments",id:ids.paymentId,expected:payment,changes:'{"amountGhs":201}'})).rejects.toThrow("exceed");
  expect(await t.run(ctx=>ctx.db.get(ids.paymentId))).toMatchObject({amountGhs:200});
  const tx=await t.run(async ctx=>JSON.stringify(await ctx.db.get(ids.transactionId)));
  await owner.mutation(api.admin.deleteCorrectionEntry,{table:"transactions",id:ids.transactionId,expected:tx});
  expect(await t.run(ctx=>ctx.db.get(ids.paymentId))).toBeNull();
  expect(await t.run(ctx=>ctx.db.get(ids.transactionId))).toBeNull();
});
