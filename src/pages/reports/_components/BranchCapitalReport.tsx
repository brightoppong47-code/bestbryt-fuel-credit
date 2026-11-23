import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
const money = (n: number | null) => n === null ? "Cash count needed" : `GHS ${n.toLocaleString("en-GH", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
export default function BranchCapitalReport() {
  const report = useQuery(api.branchCapital.overview, {});
  const record = useMutation(api.branchCapital.recordCashCount);
  const [branchId, setBranchId] = useState("");
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!report) return <p role="status">Loading branch capital…</p>;
  const complete = report.rows.every(r => r.capitalGhs !== null);
  const totalPrincipal = report.rows.reduce((s,r) => s+r.principalGhs, 0);
  const totalCapital = complete ? report.rows.reduce((s,r) => s+(r.capitalGhs ?? 0),0) : null;
  async function save() {
    if (!branchId || !cash.trim() || !Number.isFinite(Number(cash)) || Number(cash)<0 || note.trim().length<5) return;
    setBusy(true);
    try { await record({branchId:branchId as Id<"branches">, amountGhs:Number(cash), note}); setCash(""); setNote(""); toast.success("Branch cash count saved."); }
    catch(e) { toast.error(e instanceof Error ? e.message : "Could not save cash count"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <div><h2 className="text-lg font-bold">Branch capital & arrears</h2><p className="text-sm text-muted-foreground">Capital = cash available at the branch + outstanding fuel principal. Unpaid interest and penalties are shown separately.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="border rounded-lg p-4">Total branch capital<strong className="block text-xl">{money(totalCapital)}</strong></div><div className="border rounded-lg p-4">Outstanding fuel principal<strong className="block text-xl">{money(totalPrincipal)}</strong></div></div>
    {!complete && <p className="text-sm">Record a current cash count for each branch to calculate complete capital. Missing cash balances are never assumed to be zero.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Branch", "Cash available (estimate)", "Fuel principal outstanding", "Branch capital", "Unpaid interest", "Unpaid penalties", "Total outstanding", "Overdue arrears"].map(h=><th key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{report.rows.map(r=><tr key={r.branchId} className="border-t"><td className="p-3 min-w-48"><strong>{r.branch}</strong>{!r.active && <p>Inactive</p>}<p className="text-xs">Cash base: {money(r.lastCountGhs)} · Fuel today: {money(r.fuelCreditedTodayGhs)}</p><p className="text-xs text-muted-foreground">{r.lastCountAt ? `Cash counted ${new Date(r.lastCountAt).toLocaleString("en-GH")}` : "No cash count"}</p>{r.reviewItems>0 && <p className="text-xs text-amber-700">{r.reviewItems} money records need review</p>}{r.cashAvailableGhs !== null && r.cashAvailableGhs<0 && <p className="text-xs text-destructive">Recount cash / record replenishment</p>}</td>{[r.cashAvailableGhs,r.principalGhs,r.capitalGhs,r.interestGhs,r.penaltyGhs,r.totalOutstandingGhs,r.overdueGhs].map((n,i)=><td key={i} className={`p-3 whitespace-nowrap ${i===2 ? "font-bold" : ""}`}>{money(n)}</td>)}</tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">Cash available = latest actual cash count − fuel credited today ({report.cashDate}, Ghana time). All fuel issued today is deducted, including issues before the count and credits already repaid. Repayments, interest and handovers do not change this figure. Each new day uses that day’s fuel total against the latest count. Capital = cash available + outstanding fuel principal.</p>
    <div className="border rounded-lg p-4 space-y-3"><h3 className="font-bold">Record current branch cash</h3><p className="text-sm">Enter the cash base to use before deducting all of today’s fuel credits. If counting cash after issuing fuel, add back today’s fuel credited before entering the base so it is not deducted twice. The latest saved count remains the base until replaced. Every count is retained for audit.</p>
      <label className="block">Branch<select aria-label="Cash count branch" className="block w-full rounded border p-2 bg-background" value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Select branch</option>{report.rows.map(r=><option key={r.branchId} value={r.branchId}>{r.branch}</option>)}</select></label>
      <label className="block">Actual cash base / last cash count (GHS)<Input type="number" min="0" step="0.01" value={cash} onChange={e=>setCash(e.target.value)} /></label>
      <label className="block">Cash-count note<Input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="Who counted and what funds were included" /></label>
      <Button disabled={busy || !branchId || !cash.trim() || !Number.isFinite(Number(cash)) || Number(cash)<0 || note.trim().length<5} onClick={save}>{busy ? "Saving…" : "Save current cash count"}</Button>
    </div>
  </section>;
}
