import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const money = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0,10);
export default function CollectionsReport() {
  const [fromDate, setFromDate] = useState(() => new Date(Date.now()-6*86400000).toISOString().slice(0,10));
  const [toDate, setToDate] = useState(today);
  const [branchId, setBranchId] = useState("all");
  const currentUser = useQuery(api.users.getCurrentUserData);
  const allBranches = useQuery(api.branches.listBranches);
  const branches = currentUser?.role === "branch_secretary" ? allBranches?.filter(b => b._id === currentUser.branchId) : allBranches;
  const valid = !!fromDate && !!toDate && fromDate <= toDate;
  const report = useQuery(api.exports.collections, valid ? { fromDate, toDate, branchId: branchId === "all" ? undefined : branchId as Id<"branches"> } : "skip");
  const branchName = branchId === "all" ? "All accessible branches" : branches?.find(b => b._id === branchId)?.name ?? "Selected branch";
  const headings = ["Date", "Customer", "Branch", "Type", "Payments received (principal)", "Interest collected", "Penalties collected", "Total cash", "Allocation"];
  const exportRows = report?.rows.map(r => [r.date.replace("T", " ").slice(0,19), r.customer, r.branch, r.kind, money(r.principalGhs), money(r.interestGhs), money(r.penaltyGhs), money(r.cashGhs), r.reconstructed ? "Reconstructed" : "Recorded"]) ?? [];
  function csv() {
    if (!report) return;
    const contents = Papa.unparse([headings, ...exportRows, ["TOTAL", "", "", "", money(report.totals.principalGhs), money(report.totals.interestGhs), money(report.totals.penaltyGhs), money(report.totals.cashGhs), ""]]);
    const url = URL.createObjectURL(new Blob(["\ufeff"+contents], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download=`BBV-collections-${fromDate}-${toDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function pdf() {
    if (!report) return;
    const doc = new jsPDF({orientation: "landscape"});
    doc.setFontSize(16); doc.text("BESTBRYT VENTURES - Collections Report",14,18);
    doc.setFontSize(10); doc.text(`${fromDate} to ${toDate} | ${branchName} | Ghana time (UTC)`,14,26);
    doc.text(`Principal: GHS ${money(report.totals.principalGhs)}   Interest: GHS ${money(report.totals.interestGhs)}   Penalties: GHS ${money(report.totals.penaltyGhs)}   Total cash: GHS ${money(report.totals.cashGhs)}`,14,34);
    doc.text("Repayments settle principal first, then deferred interest, then penalties. Upfront interest is included in cash.",14,42);
    if (report.totals.reconstructedCount) doc.text(`${report.totals.reconstructedCount} older repayment allocations reconstructed using this order.`,14,50);
    autoTable(doc,{ startY: 56, head: [headings], body: exportRows, foot: [["TOTAL", "", "", "", money(report.totals.principalGhs), money(report.totals.interestGhs), money(report.totals.penaltyGhs), money(report.totals.cashGhs), ""]], styles: {fontSize: 7}, headStyles: { fillColor: [15,40,80] }});
    doc.save(`BBV-collections-${fromDate}-${toDate}.pdf`);
  }
  return <section className="space-y-4">
    <div className="flex justify-between flex-wrap gap-3"><div><h1 className="text-xl font-bold">Reports</h1><p className="text-sm text-muted-foreground">Cash collected, separated into principal, interest and penalties.</p></div><div className="flex gap-2"><Button variant="secondary" disabled={!report || !valid} onClick={csv}>Export CSV</Button><Button variant="secondary" disabled={!report || !valid} onClick={pdf}>Export PDF</Button></div></div>
    <Card><CardContent className="p-4 space-y-3"><div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm space-y-1 block">From date<Input type="date" value={fromDate} max={toDate} onChange={e=>setFromDate(e.target.value)}/></label>
      <label className="text-sm space-y-1 block">To date<Input type="date" value={toDate} min={fromDate} onChange={e=>setToDate(e.target.value)}/></label>
      <label className="text-sm space-y-1 block">Branch<select className="block w-full rounded-md border bg-background p-2" value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="all">All accessible branches</option>{branches?.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
    </div><div className="flex gap-2">{[7,14,30].map(days=><Button key={days} size="sm" variant="secondary" onClick={()=>{setFromDate(new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10));setToDate(today());}}>Last {days} days</Button>)}</div><p className="text-xs text-muted-foreground">Inclusive dates in Ghana time (UTC). Uses the day cash was received, including repayments of older credits.</p>{!valid && <p role="alert" className="text-destructive">Choose both dates with the start on or before the end.</p>}</CardContent></Card>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{([['Payments received (principal)','principalGhs'],['Interest collected','interestGhs'],['Penalties collected','penaltyGhs'],['Total cash received','cashGhs']] as const).map(([label,key])=><Card key={key}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold text-lg">{valid && report ? `GHS ${money(report.totals[key])}` : '—'}</p></CardContent></Card>)}</div>
    <p className="text-xs text-muted-foreground">Total cash = principal payments + interest collected + penalties collected. Partial repayments settle principal first, then unpaid interest, then penalties.</p>
    {valid && report?.totals.reconstructedCount ? <p className="text-sm rounded-md bg-muted p-3">{report.totals.reconstructedCount} older payment splits are reconstructed using that order; they were not originally recorded separately.</p> : null}
    {!valid ? null : !report ? <p>Loading collections…</p> : <>
      <Card><CardContent className="p-4"><h2 className="font-semibold mb-3">Daily collections</h2>{!report.daily.length ? <p className="text-sm text-muted-foreground">No activity in the selected dates and branch.</p> : <ResponsiveContainer width="100%" height={240}><BarChart data={report.daily}><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis/><Tooltip/><Legend/><Bar dataKey="principalGhs" name="Principal" stackId="cash" fill="#0B5ED7"/><Bar dataKey="interestGhs" name="Interest" stackId="cash" fill="#16a34a"/><Bar dataKey="penaltyGhs" name="Penalties" stackId="cash" fill="#d97706"/></BarChart></ResponsiveContainer>}</CardContent></Card>
      <Card><CardContent className="p-4"><h2 className="font-semibold mb-3">Collection details ({report.rows.length})</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headings.map(h=><th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{exportRows.map((row,i)=><tr key={i} className="border-t">{row.map((cell,j)=><td key={j} className="p-2 whitespace-nowrap">{cell}</td>)}</tr>)}</tbody></table></div>{!report.rows.length && <p className="text-sm text-muted-foreground">No cash received for these filters.</p>}</CardContent></Card>
    </>}
  </section>;
}
