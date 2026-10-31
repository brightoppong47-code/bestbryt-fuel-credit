import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { createReconciliationPdf, formatGhs, reconciliationTotals } from "./ReconciliationPdf";

export default function ReconciliationReport() {
  const user = useQuery(api.users.getCurrentUserData);
  const branches = useQuery(api.branches.listBranches);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const chosen = branchId || branches?.[0]?._id || "";
  const parsed = new Date(date);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  const report = useQuery(api.reconciliationQueue.list, user?.role === "owner" && chosen && valid ? { branchId: chosen as Id<"branches">, date } : "skip");
  if (user?.role !== "owner") return null;
  const download = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const branch = branches?.find(b => b._id === chosen);
      await createReconciliationPdf(report, branch?.name ?? "Selected branch", date).save(`BESTBRYT-reconciliation-${branch?.code ?? chosen}-${date}.pdf`, { returnPromise: true });
      toast.success("PDF downloaded. Open it and choose Print.");
    } catch { toast.error("PDF could not be created. Please try again."); }
    finally { setExporting(false); }
  };
  return <Card><CardContent className="p-4 space-y-4">
    <div className="flex flex-wrap justify-between items-start gap-3">
      <div><h2 className="text-base font-bold">Collection reconciliation &amp; handovers</h2><p className="text-xs text-muted-foreground mt-1">Select a branch and collection date, then download the results as a PDF for printing.</p></div>
      <Button onClick={download} disabled={!report || !valid || exporting} className="gap-2"><FileDown className="w-4 h-4" />{exporting ? "Preparing PDF..." : "Download reconciliation PDF"}</Button>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Reconciliation branch<select className="w-full border rounded-md bg-background p-2 mt-1" value={chosen} onChange={e => setBranchId(e.target.value)}>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
      <label className="text-sm">Collection date<Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    </div>
    {!valid ? <p role="alert" className="text-sm">Choose a valid collection date.</p> : !chosen ? <p className="text-sm text-muted-foreground">No branch available.</p> : !report ? <p role="status" className="text-sm text-muted-foreground">Loading reconciliation results...</p> : <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{reconciliationTotals(report).map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">GHS {formatGhs(value)}</p></div>)}</div>
      <p className="text-xs text-muted-foreground">{report.payments.length} customer payments and {report.handovers.length} handovers. The PDF includes receipt IDs, payment methods, references, amounts, and review statuses. Handovers are separate from customer payments; totals do not represent an exact outstanding funds balance. Legacy payments without branch data are excluded.</p>
    </>}
  </CardContent></Card>;
}
