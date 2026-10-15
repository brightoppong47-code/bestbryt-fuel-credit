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
    const branch2=await ctx.db.insert("branches",{name:"Other",code:"O",isActive:true,nextSequence:1,createdBy:owner});
    await ctx.db.insert("users",{role:"branch_secretary",branchId,tokenIdentifier:"test|secretary"});
    const customer=await ctx.db.get(driverId);
    const {_id,_creationTime,...fields}=customer!;
    const driver2=await ctx.db.insert("drivers",{...fields,branchId:branch2,accountNumber:"O1"});
    const original=await ctx.db.get(transactionId);
    const {_id:txId,_creationTime:created,...txFields}=original!;
    await ctx.db.insert("transactions",{...txFields,driverId:driver2});
    return {driverId,transactionId,paymentId,branchId,branch2};
  });
  return {t,ids,owner:t.withIdentity({tokenIdentifier:"test|owner"}),staff:t.withIdentity({tokenIdentifier:"test|staff"})};
}
it("filters both lists before pagination and combines search/status",async()=>{
 const {owner,ids}=await fixture();
 const paginationOpts={numItems:1,cursor:null};
 const drivers=await owner.query(api.drivers.listDrivers,{branchId:ids.branchId,search:"Test",paginationOpts});
 expect(drivers.page.map(d=>d._id)).toEqual([ids.driverId]);
 const credits=await owner.query(api.transactions.listTransactions,{branchId:ids.branchId,status:"paid",paginationOpts});
 expect(credits.page.map(t=>t._id)).toEqual([ids.transactionId]);
 const all=await owner.query(api.transactions.listTransactions,{paginationOpts:{numItems:20,cursor:null}});
 expect(all.page).toHaveLength(2);
});
it("prevents a branch secretary selecting another branch",async()=>{
 const {t,ids}=await fixture();
 const secretary=t.withIdentity({tokenIdentifier:"test|secretary"});
 const paginationOpts={numItems:20,cursor:null};
 expect((await secretary.query(api.drivers.listDrivers,{branchId:ids.branch2,paginationOpts})).page).toEqual([]);
 expect((await secretary.query(api.transactions.listTransactions,{branchId:ids.branch2,paginationOpts})).page).toEqual([]);
 expect((await secretary.query(api.transactions.listTransactions,{paginationOpts})).page.map(t=>t._id)).toEqual([ids.transactionId]);
});
