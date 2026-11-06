import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { billHeadings, billRows, customerPurchasesPdf, rankCustomers } from "./CustomerPurchasesPdf";
import { formatGhs } from "./ReconciliationPdf";
export default function CustomerPurchasesReport() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [busy, setBusy] = useState(false);
  const branches = useQuery(api.branches.listBranches);
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  const valid = validDate(from) && validDate(to) && from <= to;
  const bills = useQuery(api.exports.customerPurchases, valid ? { fromDate: from, toDate: to, branchId: branchId === "all" ? undefined : branchId as Id<"branches"> } : "skip");
  const customers = bills ? rankCustomers(bills) : [];
  const selectedBills = bills?.filter(b => customerId === "all" || b.customerId === customerId) ?? [];
  const ranked = rankCustomers(selectedBills);
  const scope = `${branchId === "all" ? "All accessible branches" : branches?.find(b => b._id === branchId)?.name ?? "Selected branch"} | ${customerId === "all" ? "All purchasing customers" : customers.find(c => c.customerId === customerId)?.customer ?? "Selected customer"}`;
  const pdf = async () => {
    if (!bills) return; setBusy(true);
    try { await customerPurchasesPdf(selectedBills, scope, from, to).save(`BESTBRYT-customer-purchases-${from}-to-${to}.pdf`, { returnPromise: true }); toast.success("PDF downloaded. Open it to print."); }
    catch { toast.error("Could not create PDF. Please try again."); } finally { setBusy(false); }
  };
  return <Card><CardContent className="p-4 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">Customer purchases &amp; bills</h2><p className="text-xs text-muted-foreground">Top customers by fuel purchased and number of purchases in your selected period.</p></div><Button disabled={!valid || !bills || busy} onClick={pdf}>{busy ? "Preparing PDF..." : "Download customer PDF"}</Button></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <label className="text-sm">Purchase from<Input type="date" value={from} onChange={e => { setFrom(e.target.value); setCustomerId("all"); }} /></label>
      <label className="text-sm">Purchase to<Input type="date" value={to} onChange={e => { setTo(e.target.value); setCustomerId("all"); }} /></label>
      <label className="text-sm">Purchase branch<select className="w-full p-2 border rounded-md bg-background" value={branchId} onChange={e => { setBranchId(e.target.value); setCustomerId("all"); }}><option value="all">All accessible branches</option>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
      <label className="text-sm">Customer<select className="w-full p-2 border rounded-md bg-background" value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="all">All purchasing customers</option>{customers.map(c => <option key={c.customerId} value={c.customerId}>{c.customer} ({c.account})</option>)}</select></label>
    </div>
    {!valid ? <p role="alert">Choose a valid start and end date.</p> : !bills ? <p role="status">Loading customer purchases...</p> : <>
      <p className="text-sm font-semibold">{selectedBills.length} purchases · {ranked.length} customers · GHS {formatGhs(selectedBills.reduce((s, b) => s + b.fuelGhs, 0))} fuel purchased</p>
      <h3 className="font-semibold">Top customers by fuel purchased</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Rank", "Customer", "Account", "Purchase count", "Fuel purchased GHS"].map(h => <th className="text-left p-2" key={h}>{h}</th>)}</tr></thead><tbody>{ranked.map((c, i) => <tr className="border-t" key={c.customerId}><td className="p-2">{i + 1}</td><td className="p-2">{c.customer}</td><td className="p-2">{c.account}</td><td className="p-2 font-semibold">{c.purchases}</td><td className="p-2">{formatGhs(c.fuelGhs)}</td></tr>)}</tbody></table></div>
      <h3 className="font-semibold">Bill-by-bill details</h3><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{billHeadings.map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{billRows(selectedBills).map((row, i) => <tr key={selectedBills[i].billId} className="border-t">{row.map((cell, j) => <td key={j} className="p-2 whitespace-pre-wrap break-words">{cell}</td>)}</tr>)}</tbody></table></div>
      {!selectedBills.length && <p className="text-sm text-muted-foreground">No fuel purchases in this selection.</p>}
      <p className="text-xs text-muted-foreground">Dates include both start and end days (UTC). Each issued bill counts once; repayments and handovers do not count as purchases. Ranking uses fuel value only. Branch follows the customer's current assignment. Repayments exclude upfront interest; balances and penalties are recorded values at export, not historical closing balances or projected penalties.</p>
    </>}
  </CardContent></Card>;
}
