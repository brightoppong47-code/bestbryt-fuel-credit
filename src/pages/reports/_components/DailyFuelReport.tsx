import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
const money = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
export default function DailyFuelReport() {
  const [fromDate, setFromDate] = useState(() => new Date(Date.now()-6*86400000).toISOString().slice(0,10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0,10));
  const [branchId, setBranchId] = useState("");
  const branches = useQuery(api.branches.listBranches, {});
  const valid = validDate(fromDate) && validDate(toDate) && fromDate <= toDate;
  const report = useQuery(api.exports.collections, valid ? { fromDate, toDate, branchId: branchId ? branchId as Id<"branches"> : undefined } : "skip");
  const branchName = branches?.find(b=>b._id===branchId)?.name ?? "All accessible branches";
  const rows = report?.daily.filter(d=>d.creditsGhs !== 0).map(d=>[d.date, money(d.creditsGhs)]) ?? [];
  const total = report?.totals.creditsGhs ?? 0;
  const headings = ["Date (Ghana)", "Fuel credited (GHS)"];
  function csv() {
    const blob = new Blob([Papa.unparse([["BESTBRYT VENTURES — Daily fuel credited"],[branchName,fromDate,toDate],headings,...rows,["TOTAL",money(total)]])], {type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=`BBV-daily-fuel-${fromDate}-${toDate}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function pdf() {
    const doc=new jsPDF(); doc.setFontSize(17); doc.text("BESTBRYT VENTURES",14,18); doc.setFontSize(12); doc.text("Daily fuel credited",14,27); doc.setFontSize(10); doc.text(branchName,14,35); doc.text(`${fromDate} to ${toDate} | Ghana time (UTC)`,14,42);
    autoTable(doc,{startY:49,head:[headings],body:[...rows,["TOTAL",money(total)]],headStyles:{fillColor:[23,49,80]},styles:{fontSize:10},columnStyles:{1:{halign:"right"}}}); doc.save(`BBV-daily-fuel-${fromDate}-${toDate}.pdf`);
  }
  return <section className="space-y-4">
    <div><h2 className="text-lg font-bold">Daily fuel credited</h2><p className="text-sm text-muted-foreground">Choose a branch and date range to see fuel principal issued each day and the total for the period. Includes paid and unpaid credits; excludes interest and penalties.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm">Branch<select aria-label="Daily fuel branch" className="block w-full border rounded p-2 bg-background" value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">All accessible branches</option>{[...(branches??[])].sort((a,b)=>a.name.localeCompare(b.name)).map(b=><option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
      <label className="text-sm">From date<Input aria-label="Daily fuel from date" type="date" value={fromDate} max={toDate} onChange={e=>setFromDate(e.target.value)}/></label>
      <label className="text-sm">To date<Input aria-label="Daily fuel to date" type="date" value={toDate} min={fromDate} onChange={e=>setToDate(e.target.value)}/></label>
    </div>
    <p className="text-xs text-muted-foreground">Both dates are included, using Ghana time (UTC). Dates without fuel credits have zero fuel credited and are omitted. Branch grouping follows the customer’s current branch.</p>
    {!valid ? <p role="alert">Choose a valid date range.</p> : !report ? <p role="status">Loading daily fuel credits…</p> : <>
      <div className="border rounded-lg p-4"><p>{branchName} · {fromDate} to {toDate}</p><p>Total fuel credited</p><strong className="block text-2xl">GHS {money(total)}</strong><p className="text-sm">{report.branchCredits.reduce((sum,b)=>sum+b.creditsCount,0)} credits issued</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={csv}>Export daily fuel CSV</Button><Button variant="outline" onClick={pdf}>Export daily fuel PDF</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headings.map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r[0]} className="border-t"><td className="p-3">{r[0]}</td><td className="p-3">{r[1]}</td></tr>)}</tbody><tfoot><tr className="border-t font-bold"><td className="p-3">Total for selected dates</td><td className="p-3">GHS {money(total)}</td></tr></tfoot></table></div>
      {!rows.length && <p>No fuel credited for this branch in the selected dates.</p>}
    </>}
  </section>;
}
