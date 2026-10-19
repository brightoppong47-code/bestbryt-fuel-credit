import {useState} from "react";
import {useMutation,usePaginatedQuery,useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import type {Id} from "@/convex/_generated/dataModel";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export function CustomerComplaints({branchId}:{branchId?:Id<"branches">}) {
 const [showForm,setShowForm]=useState(false);
 const [search,setSearch]=useState("");
 const [driverId,setDriverId]=useState("");
 const [category,setCategory]=useState<"vehicle_fault"|"other">("vehicle_fault");
 const [description,setDescription]=useState("");
 const [status,setStatus]=useState<"open"|"resolved"|undefined>("open");
 const [resolving,setResolving]=useState<Id<"complaints">|null>(null);
 const [resolution,setResolution]=useState("");
 const [busy,setBusy]=useState(false);
 const branches=useQuery(api.branches.listBranches);
 const [formBranch,setFormBranch]=useState("");
 const customers=usePaginatedQuery(api.drivers.listDrivers,showForm?{branchId:(formBranch || branchId) as Id<"branches">|undefined,search:search||undefined}:"skip",{initialNumItems:30});
 const complaints=usePaginatedQuery(api.complaints.list,{branchId,status},{initialNumItems:20});
 const create=useMutation(api.complaints.create);
 const resolve=useMutation(api.complaints.resolve);
 return <section className="rounded-xl border bg-card p-4 space-y-4">
  <div className="flex flex-wrap gap-3 justify-between items-center"><h2 className="font-semibold">Customer complaints</h2><Button size="sm" onClick={()=>setShowForm(!showForm)}>{showForm?"Close form":"Record complaint"}</Button></div>
  {showForm && <form className="space-y-3 border rounded-lg p-3" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await create({driverId:driverId as Id<"drivers">,category,description});setDescription("");setDriverId("");setShowForm(false);toast.success("Complaint recorded");}catch{toast.error("Could not record complaint. Check the customer, branch and details.");}finally{setBusy(false);}}}>
   <div className="space-y-1"><Label htmlFor="complaint-branch">Customer branch</Label><select id="complaint-branch" className="w-full border rounded-md bg-background p-2" value={formBranch} onChange={e=>{setFormBranch(e.target.value);setDriverId("");}}><option value="">{branchId?"Selected branch":"All assigned branches"}</option>{branches?.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}</select></div>
   <div className="space-y-1"><Label htmlFor="complaint-search">Find customer</Label><Input id="complaint-search" placeholder="Name, phone, account or vehicle plate" value={search} onChange={e=>{setSearch(e.target.value);setDriverId("");}}/></div>
   <div className="space-y-1"><Label htmlFor="complaint-customer">Customer</Label><select id="complaint-customer" required className="w-full border rounded-md bg-background p-2" value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Choose customer</option>{customers.results.map(d=><option key={d._id} value={d._id}>{d.fullName} · {d.accountNumber} · {d.vehiclePlate}</option>)}</select></div>
   {customers.status==="CanLoadMore" && <Button type="button" variant="secondary" size="sm" onClick={()=>customers.loadMore(30)}>More customers</Button>}
   <div className="space-y-1"><Label htmlFor="complaint-category">Complaint type</Label><select id="complaint-category" className="w-full border rounded-md bg-background p-2" value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="vehicle_fault">Vehicle fault / breakdown</option><option value="other">Other customer complaint</option></select></div>
   <div className="space-y-1"><Label htmlFor="complaint-description">Complaint details</Label><textarea id="complaint-description" className="w-full border rounded-md bg-background p-2" required maxLength={4000} rows={3} placeholder="Describe what the customer reported, the vehicle fault and follow-up needed." value={description} onChange={e=>setDescription(e.target.value)}/></div>
   <p className="text-xs text-muted-foreground">Recording a complaint does not pause penalties or change the balance.</p>
   <Button disabled={busy || !driverId || !description.trim()}>{busy?"Saving…":"Save complaint"}</Button>
  </form>}
  <div className="space-y-1"><Label htmlFor="complaint-status">Complaint status</Label><select id="complaint-status" className="border rounded-md bg-background p-2 ml-2" value={status??"all"} onChange={e=>setStatus(e.target.value==="all"?undefined:e.target.value as "open"|"resolved")}><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select></div>
  {complaints.status==="LoadingFirstPage" && <p className="text-sm">Loading complaints…</p>}
  {complaints.status!=="LoadingFirstPage" && !complaints.results.length && <p className="text-sm text-muted-foreground">No complaints in this view.</p>}
  {complaints.results.map(c=><article key={c._id} className="border rounded-lg p-3 space-y-2 text-sm">
   <p className="font-medium">{c.customer} · {c.vehiclePlate}</p><p className="text-xs text-muted-foreground">{c.branch} · {c.accountNumber} · {c.status === "open"?"Open":"Resolved"}</p>
   <p className="font-medium">{c.category==="vehicle_fault"?"Vehicle fault / breakdown":"Other complaint"}</p><p className="whitespace-pre-wrap break-words">{c.description}</p>
   <p className="text-xs text-muted-foreground">Reported by {c.reporter} · {new Date(c.createdAt).toLocaleString("en-GH")}</p>
   {c.resolution && <p className="whitespace-pre-wrap break-words">Resolution: {c.resolution}</p>}
   {c.status==="open" && resolving!==c._id && <Button size="sm" variant="secondary" onClick={()=>{setResolving(c._id);setResolution("");}}>Mark resolved</Button>}
   {resolving===c._id && <form className="space-y-2" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await resolve({complaintId:c._id,resolution});setResolving(null);toast.success("Complaint resolved");}catch{toast.error("Could not resolve complaint");}finally{setBusy(false);}}}><Label htmlFor={`resolution-${c._id}`}>Resolution notes</Label><textarea id={`resolution-${c._id}`} required maxLength={4000} className="w-full border rounded-md bg-background p-2" value={resolution} onChange={e=>setResolution(e.target.value)}/><Button size="sm" disabled={busy || !resolution.trim()}>Save resolution</Button></form>}
  </article>)}
  {complaints.status==="CanLoadMore" && <Button variant="secondary" onClick={()=>complaints.loadMore(20)}>Load more complaints</Button>}
 </section>;
}
