import { expect, it, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
afterEach(()=>vi.useRealTimers());
async function fixture() {
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"owner"});
  const a=await ctx.db.insert("branches",{name:"A",code:"A",isActive:true,nextSequence:1,createdBy:owner});
  const b=await ctx.db.insert("branches",{name:"B",code:"B",isActive:true,nextSequence:1,createdBy:owner});
  await ctx.db.insert("users",{role:"staff",tokenIdentifier:"staff",branchId:a});
  const driver=await ctx.db.insert("drivers",{fullName:"Customer",phone:"0",address:"Test",vehicleType:"Taxi",vehiclePlate:"TEST",gpsLatitude:0,gpsLongitude:0,branchId:a,accountNumber:"A1",sequenceNumber:1,isActive:true,registeredBy:owner});
  return {owner,a,b,driver};
 });
 return {t,ids,owner:t.withIdentity({tokenIdentifier:"owner"}),staff:t.withIdentity({tokenIdentifier:"staff"})};
}
it("requires an actual cash count and enforces owner access",async()=>{
 const {owner,staff,ids}=await fixture();
 const report=await owner.query(api.branchCapital.overview,{});
 expect(report.rows.every(r=>r.capitalGhs===null)).toBe(true);
 await expect(staff.query(api.branchCapital.overview,{})).rejects.toThrow();
 await expect(staff.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:100,note:"Cash counted"})).rejects.toThrow();
 await expect(owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:-1,note:"Cash counted"})).rejects.toThrow();
 await expect(owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:1.001,note:"Cash counted"})).rejects.toThrow();
});
it("separates branch cash and principal from interest and penalties without double-counting handovers",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-23T14:00:00Z"));
 const {t,owner,ids}=await fixture();
 await owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:10});
 await owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:1000,note:"Counted till and branch wallet"});
 vi.advanceTimersByTime(1000);
 const tx=await t.run(ctx=>ctx.db.insert("transactions",{driverId:ids.driver,fuelAmountGhs:100,interestGhs:10,interestCollectedUpfront:true,totalOwedGhs:100,issuedAt:"2026-11-21T06:00:00Z",dueAt:"2026-11-22T06:00:00Z",status:"overdue",penaltyGhs:0,amountPaidGhs:40,issuedBy:ids.owner}));
 await t.run(async ctx=>{
  await ctx.db.insert("payments",{transactionId:tx,driverId:ids.driver,branchId:ids.a,amountGhs:40,recordedAt:new Date().toISOString(),recordedBy:ids.owner,paymentMethod:"cash",reconciliationStatus:"verified"});
  await ctx.db.insert("collection_handovers",{branchId:ids.a,staffId:ids.owner,recordedBy:ids.owner,amountGhs:20,method:"cash",recordedAt:new Date().toISOString(),status:"verified"});
 });
 const r=(await owner.query(api.branchCapital.overview,{})).rows;
 expect(r[0]).toMatchObject({cashAvailableGhs:1000,principalGhs:60,interestGhs:0,penaltyGhs:10,capitalGhs:1060,totalOutstandingGhs:70,overdueGhs:70});
 expect(r[1]).toMatchObject({cashAvailableGhs:null,capitalGhs:null,principalGhs:0});
 // A fresh actual count resets the cash estimate without resetting customer debts.
 vi.advanceTimersByTime(1000);
 await owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:950,note:"Cash replenished and recounted"});
 expect((await owner.query(api.branchCapital.overview,{})).rows[0]).toMatchObject({cashAvailableGhs:950,principalGhs:60,capitalGhs:1010});
 expect(await t.run(ctx=>ctx.db.query("branch_cash_counts").collect())).toHaveLength(2);
});
it("uses the Monday grace in real balance and statement queries",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-23T13:59:59Z"));
 const {t,owner,ids}=await fixture();
 await owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:10});
 const tx=await t.run(ctx=>ctx.db.insert("transactions",{driverId:ids.driver,fuelAmountGhs:100,interestGhs:10,interestCollectedUpfront:true,totalOwedGhs:100,issuedAt:"2026-11-21T06:00:00Z",dueAt:"2026-11-22T06:00:00Z",status:"overdue",penaltyGhs:0,issuedBy:ids.owner}));
 expect(await owner.query(api.transactions.getTransaction,{transactionId:tx})).toMatchObject({livePenalty:0,remainingGhs:100});
 vi.advanceTimersByTime(1000);
 expect(await owner.query(api.transactions.getTransaction,{transactionId:tx})).toMatchObject({livePenalty:10,remainingGhs:110});
 expect(await owner.query(api.customerStatements.statement,{driverId:ids.driver,fromDate:"2026-11-01",toDate:"2026-11-23"})).toMatchObject({currentPenaltyGhs:10,currentOutstandingGhs:110});
});
it("deducts only the current Ghana day's full fuel total from the latest count",async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-23T14:00:00Z"));
 const {t,owner,ids}=await fixture();
 const issue=async(issuedAt:string,amount:number,status:"paid"|"pending"="pending")=>t.run(ctx=>ctx.db.insert("transactions",{driverId:ids.driver,fuelAmountGhs:amount,interestGhs:0,totalOwedGhs:amount,issuedAt,dueAt:"2026-11-25T00:00:00Z",status,penaltyGhs:0,issuedBy:ids.owner}));
 await issue("2026-11-22T23:59:59Z",700);
 await issue("2026-11-23T00:00:00Z",100,"paid");
 await owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:1000,note:"Opening cash base"});
 vi.advanceTimersByTime(1000);
 await issue("2026-11-23T13:00:00Z",200);
 expect((await owner.query(api.branchCapital.overview,{})).rows[0]).toMatchObject({cashAvailableGhs:700,fuelCreditedTodayGhs:300});
 await owner.mutation(api.branchCapital.recordCashCount,{branchId:ids.a,amountGhs:250,note:"Revised cash base"});
 expect((await owner.query(api.branchCapital.overview,{})).rows[0].cashAvailableGhs).toBe(-50);
 vi.setSystemTime(new Date("2026-11-24T00:00:00Z"));
 expect((await owner.query(api.branchCapital.overview,{})).rows[0]).toMatchObject({cashAvailableGhs:250,fuelCreditedTodayGhs:0});
 await issue("2026-11-24T00:00:00Z",50);
 expect((await owner.query(api.branchCapital.overview,{})).rows[0].cashAvailableGhs).toBe(200);
});
