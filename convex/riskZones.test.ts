import {it,expect} from "vitest";
import {convexTest} from "convex-test";
import schema from "./schema";
import {modules} from "./test.setup";
import {api} from "./_generated/api";
const paginationOpts={numItems:50,cursor:null};
async function fixture(){
 const t=convexTest(schema,modules);
 const ids=await t.run(async ctx=>{
  const owner=await ctx.db.insert("users",{role:"owner",tokenIdentifier:"zone|admin"});
  const branches=[];const drivers=[];const transactions=[];
  for(let i=0;i<3;i++){
   const branch=await ctx.db.insert("branches",{name:`Branch ${i}`,code:`Z${i}`,isActive:true,nextSequence:2,createdBy:owner});branches.push(branch);
   const driver=await ctx.db.insert("drivers",{fullName:`Customer ${i}`,phone:"000",address:"Test",vehicleType:"Taxi",vehiclePlate:`CAR${i}`,gpsLatitude:0,gpsLongitude:0,branchId:branch,accountNumber:`Z${i}-1`,sequenceNumber:1,isActive:true,registeredBy:owner});drivers.push(driver);
   const dueAt=new Date(Date.now()-3*86400000).toISOString();
   transactions.push(await ctx.db.insert("transactions",{driverId:driver,fuelAmountGhs:100,interestGhs:5,interestCollectedUpfront:true,totalOwedGhs:100,penaltyGhs:0,issuedAt:new Date(Date.now()-4*86400000).toISOString(),dueAt,status:"pending",amountPaidGhs:0,issuedBy:owner}));
  }
  const risk=await ctx.db.insert("users",{role:"risk_manager",branchId:branches[0],branchIds:branches.slice(0,2),tokenIdentifier:"zone|risk"});
  const staff=await ctx.db.insert("users",{role:"staff",branchId:branches[0],branchIds:branches,tokenIdentifier:"zone|staff"});
  const other=await ctx.db.insert("users",{role:"risk_manager",branchIds:[branches[2]],tokenIdentifier:"zone|other"});
  return {owner,branches,drivers,transactions,risk,staff,other};
 });
 return {t,ids,risk:t.withIdentity({tokenIdentifier:"zone|risk"}),admin:t.withIdentity({tokenIdentifier:"zone|admin"}),staff:t.withIdentity({tokenIdentifier:"zone|staff"}),other:t.withIdentity({tokenIdentifier:"zone|other"})};
}
it("risk manager sees all 3+ day overdue customers across the assigned zone only",async()=>{
 const {t,ids,risk,staff}=await fixture();
 expect((await risk.query(api.transactions.getOverdueAlerts,{})).map(a=>a.driverId).sort()).toEqual(ids.drivers.slice(0,2).sort());
 expect((await risk.query(api.branches.listBranches,{})).map(b=>b._id).sort()).toEqual(ids.branches.slice(0,2).sort());
 expect((await risk.query(api.drivers.listDrivers,{paginationOpts})).page).toHaveLength(2);
 expect((await risk.query(api.drivers.listDrivers,{paginationOpts,branchId:ids.branches[1]})).page.map(d=>d._id)).toEqual([ids.drivers[1]]);
 expect(await risk.query(api.drivers.getDriver,{driverId:ids.drivers[2]})).toBeNull();
 expect((await staff.query(api.drivers.listDrivers,{paginationOpts})).page.map(d=>d._id)).toEqual([ids.drivers[0]]);
 await t.run(async ctx=>{await ctx.db.patch("transactions",ids.transactions[1],{dueAt:new Date(Date.now()-3*86400000+60000).toISOString()});});
 expect((await risk.query(api.transactions.getOverdueAlerts,{})).map(a=>a.driverId)).toEqual([ids.drivers[0]]);
 await t.run(async ctx=>{await ctx.db.patch("transactions",ids.transactions[0],{status:"paid",amountPaidGhs:100});});
 expect(await risk.query(api.transactions.getOverdueAlerts,{})).toEqual([]);
});
it("risk manager can register in a selected zone branch; cannot register outside it",async()=>{
 const {ids,risk}=await fixture();
 const args={fullName:"New customer",phone:"000",address:"Test",vehicleType:"Taxi",vehiclePlate:"NEW",gpsLatitude:0,gpsLongitude:0,branchId:ids.branches[1]};
 const driver=await risk.mutation(api.drivers.registerDriver,args);
 expect((await risk.query(api.drivers.getDriver,{driverId:driver}))?.branchId).toBe(ids.branches[1]);
 await expect(risk.mutation(api.drivers.registerDriver,{...args,branchId:ids.branches[2]})).rejects.toThrow("assigned branch");
});
it("only admin assigns zones; revoked and cleared branches lose access immediately",async()=>{
 const {ids,risk,admin,staff}=await fixture();
 await expect(risk.mutation(api.users.updateUserRole,{userId:ids.risk,role:"risk_manager",branchIds:ids.branches})).rejects.toThrow("Only owners");
 await admin.mutation(api.users.updateUserRole,{userId:ids.risk,role:"risk_manager",branchIds:[ids.branches[1],ids.branches[2]]});
 expect((await risk.query(api.drivers.listDrivers,{paginationOpts})).page.map(d=>d._id).sort()).toEqual(ids.drivers.slice(1).sort());
 await admin.mutation(api.users.updateUserRole,{userId:ids.risk,role:"risk_manager",branchIds:[]});
 expect(await risk.query(api.transactions.getOverdueAlerts,{})).toEqual([]);
 await expect(staff.query(api.transactions.getOverdueAlerts,{})).rejects.toThrow("Risk Manager");
});
it("complaints preserve customer, branch and reporter; resolution is restricted to the zone",async()=>{
 const {t,ids,risk,admin,staff,other}=await fixture();
 const complaintId=await risk.mutation(api.complaints.create,{driverId:ids.drivers[1],category:"vehicle_fault",description:" Engine fault; customer requests follow-up "});
 const rows=(await risk.query(api.complaints.list,{paginationOpts})).page;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({branchId:ids.branches[1],reportedBy:ids.risk,status:"open",description:"Engine fault; customer requests follow-up"});
 await expect(risk.mutation(api.complaints.create,{driverId:ids.drivers[2],category:"other",description:"Outside"})).rejects.toThrow("assigned branch");
 await expect(staff.mutation(api.complaints.create,{driverId:ids.drivers[0],category:"other",description:"Denied"})).rejects.toThrow("Risk Manager");
 expect((await other.query(api.complaints.list,{paginationOpts})).page).toEqual([]);
 await expect(other.mutation(api.complaints.resolve,{complaintId,resolution:"Not allowed"})).rejects.toThrow("assigned branch");
 await expect(risk.mutation(api.complaints.resolve,{complaintId,resolution:" "})).rejects.toThrow("resolution notes");
 await risk.mutation(api.complaints.resolve,{complaintId,resolution:"Vehicle repaired; customer contacted"});
 expect((await admin.query(api.complaints.list,{paginationOpts,status:"resolved"})).page[0]).toMatchObject({resolvedBy:ids.risk,status:"resolved"});
 const tx=await t.run(async ctx=>ctx.db.get("transactions",ids.transactions[1]));
 expect(tx?.amountPaidGhs).toBe(0);expect(tx?.penaltyPausedUntil).toBeUndefined();
});
it("reports and exports include the zone but never an unassigned branch",async()=>{
 const {ids,risk}=await fixture();
 expect(await risk.query(api.exports.getAllDriversForExport,{})).toHaveLength(2);
 const dates={fromDate:"2000-01-01",toDate:"2099-01-01"};
 expect((await risk.query(api.exports.collections,dates)).totals.creditsGhs).toBe(200);
 expect((await risk.query(api.reports.collections,dates)).totals.creditsGhs).toBe(200);
 await expect(risk.query(api.exports.collections,{...dates,branchId:ids.branches[2]})).rejects.toThrow("assigned branch");
});
