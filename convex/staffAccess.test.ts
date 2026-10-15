import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

async function fixture() {
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"test|owner"});
    await ctx.db.insert("users",{role:"staff",tokenIdentifier:"test|unassigned"});
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
    await ctx.db.insert("users",{role:"staff",branchId,tokenIdentifier:"test|assigned"});
    return {driverId,transactionId,paymentId,branchId,branch2,driver2};
  });
  return {t,ids,owner:t.withIdentity({tokenIdentifier:"test|owner"}),staff:t.withIdentity({tokenIdentifier:"test|unassigned"})};
}

it("staff can only list, export, view and update assigned customers",async()=>{
 const {t,ids,owner}=await fixture();
 const staff=t.withIdentity({tokenIdentifier:"test|assigned"});
 const paginationOpts={numItems:20,cursor:null};
 expect((await staff.query(api.drivers.listDrivers,{paginationOpts})).page.map(d=>d._id)).toEqual([ids.driverId]);
 expect((await staff.query(api.transactions.listTransactions,{paginationOpts})).page.map(t=>t._id)).toEqual([ids.transactionId]);
 expect(await staff.query(api.drivers.getDriver,{driverId:ids.driver2})).toBeNull();
 await expect(staff.mutation(api.drivers.updateDriver,{driverId:ids.driver2,phone:"bad"})).rejects.toThrow("assigned branch");
 await expect(staff.mutation(api.drivers.updateDriver,{driverId:ids.driverId,branchId:ids.branch2})).rejects.toThrow("assigned branch");
 await staff.mutation(api.drivers.updateDriver,{driverId:ids.driverId,phone:"123"});
 expect(await staff.query(api.exports.getAllDriversForExport,{})).toHaveLength(1);
 expect(await staff.query(api.exports.getAllTransactionsForExport,{})).toHaveLength(1);
 expect(await owner.query(api.exports.getAllDriversForExport,{})).toHaveLength(2);
 expect(await staff.query(api.branches.listBranches,{})).toHaveLength(1);
});
it("direct credit and payment IDs cannot bypass branch checks",async()=>{
 const {t,ids}=await fixture();
 const other=t.withIdentity({tokenIdentifier:"test|unassigned"});
 for (const endpoint of [api.transactions.getTransaction,api.transactions.getPayments]) {
   await expect(other.query(endpoint,{transactionId:ids.transactionId})).rejects.toThrow("assigned branch");
 }
 await expect(other.mutation(api.transactions.recordPayment,{transactionId:ids.transactionId,amountGhs:1})).rejects.toThrow("assigned branch");
 await expect(other.mutation(api.transactions.markPaid,{transactionId:ids.transactionId})).rejects.toThrow("assigned branch");
 await expect(other.mutation(api.transactions.refreshPenalties,{transactionId:ids.transactionId})).rejects.toThrow("assigned branch");
 await expect(other.query(api.transactions.getDriverBalance,{driverId:ids.driverId})).rejects.toThrow("assigned branch");
 expect((await other.query(api.drivers.listDrivers,{paginationOpts:{numItems:20,cursor:null}})).page).toEqual([]);
 expect(await other.query(api.exports.getAllDriversForExport,{})).toEqual([]);
 expect((await other.query(api.transactions.getDashboardStats,{})).activeDrivers).toBe(0);
});
it("rejects registering or reporting in another branch and isolates aggregates",async()=>{
 const {t,ids}=await fixture();const staff=t.withIdentity({tokenIdentifier:"test|assigned"});
 await expect(staff.mutation(api.transactions.issueCredit,{driverId:ids.driver2,fuelAmountGhs:100})).rejects.toThrow("assigned branch");
 await expect(staff.mutation(api.drivers.registerDriver,{branchId:ids.branch2,fullName:"Wrong",phone:"0",address:"Test",vehicleType:"Taxi",vehiclePlate:"X",gpsLatitude:0,gpsLongitude:0})).rejects.toThrow("assigned branch");
 await expect(staff.query(api.exports.collections,{fromDate:"2099-01-01",toDate:"2099-01-02",branchId:ids.branch2})).rejects.toThrow("assigned branch");
 const report=await staff.query(api.exports.collections,{fromDate:"2099-01-01",toDate:"2099-01-02"});
 expect(report.totals.creditsGhs).toBe(200);
 expect((await staff.query(api.transactions.getDashboardStats,{})).activeDrivers).toBe(1);
 await expect(staff.query(api.eod.getTodayStats,{branchId:ids.branch2,reportDate:"2099-01-01"})).rejects.toThrow("assigned branch");
});
