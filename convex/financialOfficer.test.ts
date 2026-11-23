import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"owner"});
  const a=await ctx.db.insert("branches",{name:"A",code:"A",isActive:true,nextSequence:1,createdBy:owner});
  const b=await ctx.db.insert("branches",{name:"B",code:"B",isActive:true,nextSequence:1,createdBy:owner});
  const officer=await ctx.db.insert("users",{role:"financial_officer",name:"Finance Person",email:"finance@example.com",tokenIdentifier:"finance"});
  const staff=await ctx.db.insert("users",{role:"staff",branchId:a,tokenIdentifier:"staff"});
  const data=[];
  for(const branchId of [a,b]){
   const driver=await ctx.db.insert("drivers",{fullName:"Customer",phone:"0",address:"Test",vehicleType:"Taxi",vehiclePlate:"TEST",gpsLatitude:0,gpsLongitude:0,branchId,accountNumber:String(branchId),sequenceNumber:1,isActive:true,registeredBy:owner});
   const tx=await ctx.db.insert("transactions",{driverId:driver,fuelAmountGhs:100,interestGhs:10,interestCollectedUpfront:true,totalOwedGhs:100,issuedAt:"2026-11-20T06:00:00Z",dueAt:"2099-11-21T06:00:00Z",status:"pending",penaltyGhs:0,amountPaidGhs:20,issuedBy:staff});
   const payment=await ctx.db.insert("payments",{driverId:driver,transactionId:tx,branchId,amountGhs:20,principalGhs:20,interestGhs:0,penaltyGhs:0,recordedAt:"2026-11-20T08:00:00Z",recordedBy:staff,paymentMethod:"cash",reconciliationStatus:"pending"});
   const handover=await ctx.db.insert("collection_handovers",{branchId,staffId:staff,recordedBy:staff,amountGhs:20,method:"cash",recordedAt:"2026-11-20T09:00:00Z",collectionDate:"2026-11-20",status:"pending"});
   data.push({driver,tx,payment,handover});
  }
  return {owner,a,b,officer,staff,data};
 });
 return {t,ids,finance:t.withIdentity({tokenIdentifier:"finance"}),owner:t.withIdentity({tokenIdentifier:"owner"}),staff:t.withIdentity({tokenIdentifier:"staff"})};
}
it("grants all-branch finance reporting with separate received principal, interest and fuel totals",async()=>{
 const {finance,staff,ids}=await fixture();
 expect(await finance.query(api.branches.listBranches,{})).toHaveLength(2);
 expect((await finance.query(api.branchCapital.overview,{})).rows.map(r=>r.principalGhs)).toEqual([80,80]);
 const result=await finance.query(api.exports.collections,{fromDate:"2026-11-20",toDate:"2026-11-20"});
 expect(result.totals).toMatchObject({principalGhs:40,interestGhs:20,penaltyGhs:0,creditsGhs:200,cashGhs:60,reconstructedCount:0});
 expect(result.branchSummary.map(b=>[b.principalGhs,b.interestGhs,b.creditsGhs])).toEqual([[20,10,100],[20,10,100]]);
 await expect(staff.query(api.reconciliationQueue.list,{branchId:ids.b,date:"2026-11-20"})).rejects.toThrow();
 await expect(staff.query(api.branchCapital.overview,{})).rejects.toThrow();
});
it("verifies handovers and payments and makes corrections with immutable named audit records",async()=>{
 const {t,finance,owner,ids}=await fixture();const source=ids.data[1];
 await finance.mutation(api.collectionReconciliation.reviewHandover,{handoverId:source.handover,decision:"verified",note:"Cash physically counted"});
 await finance.mutation(api.collectionReconciliation.reviewPayment,{paymentId:source.payment,decision:"verified",note:"Receipt matched and checked"});
 await finance.mutation(api.transactionAdjustments.adjust,{transactionId:source.tx,component:"principal",deltaGhs:-10,reason:"Correct duplicated fuel amount"});
 await t.run(ctx=>ctx.db.patch(ids.officer,{name:"Renamed Person",role:"staff"}));
 const history=await owner.query(api.transactionAdjustments.history,{transactionId:source.tx});
 expect(history[0]).toMatchObject({actorName:"Finance Person",actorEmail:"finance@example.com",actorRole:"financial_officer",actorId:ids.officer,deltaGhs:-10});
 const queue=await owner.query(api.reconciliationQueue.list,{branchId:ids.b,date:"2026-11-20"});
 expect(queue.payments[0]).toMatchObject({reviewerName:"Finance Person",reviewerRole:"financial_officer",reviewNote:"Receipt matched and checked"});
 expect(queue.handovers[0]).toMatchObject({reviewerName:"Finance Person",reviewerEmail:"finance@example.com",reviewNote:"Cash physically counted"});
 expect(await t.run(ctx=>ctx.db.query("collection_reconciliation_events").collect())).toHaveLength(2);
 await expect(owner.mutation(api.collectionReconciliation.reviewHandover,{handoverId:source.handover,decision:"verified",note:"Again"})).rejects.toThrow("Already reviewed");
 expect((await owner.query(api.reports.financialAudit,{fromDate:"2026-01-01",toDate:"2099-12-31"})).every(r=>r.actorName==="Finance Person")).toBe(true);
});
it("prevents finance from promoting users, changing settings or originating operational money records",async()=>{
 const {finance,ids}=await fixture();const source=ids.data[0];
 await expect(finance.mutation(api.users.updateUserRole,{userId:ids.officer,role:"owner"})).rejects.toThrow();
 await expect(finance.mutation(api.appSettings.setInterestRate,{interestRatePercent:1})).rejects.toThrow();
 await expect(finance.mutation(api.transactions.issueCredit,{driverId:source.driver,fuelAmountGhs:100,expectedInterestRatePercent:5})).rejects.toThrow("operational");
 await expect(finance.mutation(api.transactions.recordPayment,{transactionId:source.tx,amountGhs:20})).rejects.toThrow("operational");
 await expect(finance.mutation(api.collectionReconciliation.recordHandover,{branchId:ids.a,amountGhs:20,collectionDate:"2026-11-20",method:"cash"})).rejects.toThrow("operational");
 await expect(finance.mutation(api.branches.createBranch,{name:"X",code:"XX"})).rejects.toThrow();
});
it("lets only admin assign the financial role without a branch",async()=>{
 const {owner,t,ids}=await fixture();
 await owner.mutation(api.users.updateUserRole,{userId:ids.staff,role:"financial_officer"});
 expect(await t.run(ctx=>ctx.db.get(ids.staff))).toMatchObject({role:"financial_officer"});
 expect((await t.run(ctx=>ctx.db.get(ids.staff)))?.branchId).toBeUndefined();
});
