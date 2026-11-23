import { useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
export default function FinancialAuditReport(){
 const [from,setFrom]=useState(()=>new Date(Date.now()-29*86400000).toISOString().slice(0,10));
 const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
 const valid=!!from&&!!to&&from<=to;
 const rows=useQuery(api.reports.financialAudit,valid?{fromDate:from,toDate:to}:"skip");
 return <section className="space-y-4"><h2 className="font-bold text-lg">Financial audit history</h2><p className="text-sm">Every cash count, debt adjustment and payment or handover verification records the person, role, date and reason. Existing legacy entries use the saved user reference where available.</p><div className="grid grid-cols-2 gap-3"><label>From<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>{!valid?<p>Choose a valid date range.</p>:!rows?<p>Loading audit history…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Date","Action","Branch","Amount / correction","Performed by","Reference","Reason / evidence"].map(h=><th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r._id} className="border-t"><td className="p-2 whitespace-nowrap">{r.date.replace("T"," ").slice(0,19)}</td><td className="p-2">{r.type}</td><td className="p-2">{r.branch}</td><td className="p-2">{r.amountGhs===null?"See source record":`GHS ${r.amountGhs.toFixed(2)}`}</td><td className="p-2"><strong>{r.actorName}</strong><p>{r.actorRole.replaceAll("_"," ")}</p><p>{r.actorEmail}</p><small>{r.actorId}</small></td><td className="p-2">{r.transactionId?<Link className="underline" to={`/credits/${r.transactionId}`}>{r.reference.slice(-12)}</Link>:r.reference.slice(-12)}</td><td className="p-2 min-w-56">{r.reason}</td></tr>)}</tbody></table>{!rows.length&&<p>No cash counts, adjustments or verification events for these dates.</p>}</div>}</section>;
}
