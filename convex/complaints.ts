import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireRiskManagerOrOwner, assertDriverAccess, assertBranchAccess, canAccessBranch, assignedBranchIds } from "./helpers";

export const create = mutation({
 args:{driverId:v.id("drivers"), category:v.union(v.literal("vehicle_fault"),v.literal("other")),description:v.string()},
 handler:async(ctx,args)=>{
  const user=await requireRiskManagerOrOwner(ctx);
  const driver=await assertDriverAccess(ctx,user,args.driverId);
  const description=args.description.trim();
  if(!description || description.length>4000) throw new ConvexError({message:"Enter complaint details (up to 4,000 characters)",code:"BAD_REQUEST"});
  return await ctx.db.insert("complaints",{driverId:driver._id,branchId:driver.branchId,category:args.category,description,status:"open",reportedBy:user._id,createdAt:new Date().toISOString()});
 }
});
export const list = query({
 args:{paginationOpts:paginationOptsValidator,branchId:v.optional(v.id("branches")),status:v.optional(v.union(v.literal("open"),v.literal("resolved")))},
 handler:async(ctx,args)=>{
  const user=await requireRiskManagerOrOwner(ctx);
  if(args.branchId) assertBranchAccess(user,args.branchId);
  let query=args.branchId ? ctx.db.query("complaints").withIndex("by_branch",q=>q.eq("branchId",args.branchId!)) : ctx.db.query("complaints").fullTableScan();
  if(!args.branchId && user.role!=="owner") {
   const ids=assignedBranchIds(user);
   if(!ids.length) return {page:[],isDone:true,continueCursor:""};
   query=query.filter(q=>q.or(...ids.map(id=>q.eq(q.field("branchId"),id))));
  }
  if(args.status) query=query.filter(q=>q.eq(q.field("status"),args.status!));
  const result=await query.order("desc").paginate(args.paginationOpts);
  const page=(await Promise.all(result.page.map(async complaint=>{
   const driver=await ctx.db.get("drivers",complaint.driverId);
   if(!driver || !canAccessBranch(user,driver.branchId)) return null;
   const branch=await ctx.db.get("branches",complaint.branchId);
   const reporter=await ctx.db.get("users",complaint.reportedBy);
   return {...complaint,customer:driver.fullName,accountNumber:driver.accountNumber,vehiclePlate:driver.vehiclePlate,branch:branch?.name ?? "Unknown branch",reporter:reporter?.name ?? "Staff"};
  }))).filter((row):row is NonNullable<typeof row>=>row!==null);
  return {...result,page};
 }
});
export const resolve = mutation({
 args:{complaintId:v.id("complaints"),resolution:v.string()},
 handler:async(ctx,args)=>{
  const user=await requireRiskManagerOrOwner(ctx);
  const complaint=await ctx.db.get("complaints",args.complaintId);
  if(!complaint) throw new ConvexError({message:"Complaint not found",code:"NOT_FOUND"});
  assertBranchAccess(user,complaint.branchId);
  await assertDriverAccess(ctx,user,complaint.driverId);
  if(complaint.status==="resolved") throw new ConvexError({message:"Complaint is already resolved",code:"BAD_REQUEST"});
  const resolution=args.resolution.trim();
  if(!resolution || resolution.length>4000) throw new ConvexError({message:"Enter resolution notes (up to 4,000 characters)",code:"BAD_REQUEST"});
  await ctx.db.patch("complaints",complaint._id,{status:"resolved",resolution,resolvedAt:new Date().toISOString(),resolvedBy:user._id});
 }
});
