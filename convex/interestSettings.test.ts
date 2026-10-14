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
    return {driverId};
  });
  return {t,ids,owner:t.withIdentity({tokenIdentifier:"test|owner"}),staff:t.withIdentity({tokenIdentifier:"test|staff"})};
}
it("defaults to 5% and restricts changes to admin",async()=>{
  const {owner,staff}=await fixture();
  expect(await owner.query(api.appSettings.getAppSettings,{})).toMatchObject({interestRatePercent:5});
  await expect(staff.mutation(api.appSettings.setInterestRate,{interestRatePercent:7})).rejects.toThrow();
  await expect(owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:-1})).rejects.toThrow();
});
it("uses decimal rates and preserves issued credits after settings change",async()=>{
  const {t,ids,owner}=await fixture();
  await owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:7.5});
  const id=await owner.mutation(api.transactions.issueCredit,{driverId:ids.driverId,fuelAmountGhs:150,expectedInterestRatePercent:7.5});
  expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({interestRatePercent:7.5,interestGhs:11.25,totalOwedGhs:161.25});
  await owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:120});
  expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({interestRatePercent:7.5,interestGhs:11.25,totalOwedGhs:161.25});
  expect(await owner.query(api.appSettings.getAppSettings,{})).toMatchObject({interestRatePercent:120});
});
it("rejects stale confirmation and supports zero interest",async()=>{
  const {t,ids,owner}=await fixture();
  await owner.mutation(api.appSettings.setInterestRate,{interestRatePercent:0});
  await expect(owner.mutation(api.transactions.issueCredit,{driverId:ids.driverId,fuelAmountGhs:100,expectedInterestRatePercent:5})).rejects.toThrow("percentage changed");
  await expect(owner.mutation(api.transactions.issueCredit,{driverId:ids.driverId,fuelAmountGhs:100})).rejects.toThrow("percentage changed");
  const id=await owner.mutation(api.transactions.issueCredit,{driverId:ids.driverId,fuelAmountGhs:100,expectedInterestRatePercent:0,interestCollectedUpfront:true});
  expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject({interestRatePercent:0,interestGhs:0,totalOwedGhs:100});
});
