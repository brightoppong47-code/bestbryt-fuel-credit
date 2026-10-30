import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const money = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function ReconciliationPage() {
  const user = useQuery(api.users.getCurrentUserData);
  const branches = useQuery(api.branches.listBranches);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = branchId || branches?.[0]?._id || "";
  const queue = useQuery(api.reconciliationQueue.list, user?.role === "owner" && chosen ? { branchId: chosen as Id<"branches">, date } : "skip");
  const reviewPayment = useMutation(api.collectionReconciliation.reviewPayment);
  const reviewHandover = useMutation(api.collectionReconciliation.reviewHandover);
  if (user?.role !== "owner") return <div className="p-6">Admin access required.</div>;
  const decide = async (kind: "payment" | "handover", id: string, decision: "verified" | "disputed") => {
    if (!notes[id]?.trim()) { toast.error("Enter verification evidence or a discrepancy note."); return; }
    setBusy(id);
    try {
      if (kind === "payment") await reviewPayment({ paymentId: id as Id<"payments">, decision, note: notes[id].trim() });
      else await reviewHandover({ handoverId: id as Id<"collection_handovers">, decision, note: notes[id].trim() });
      toast.success("Review saved.");
      setNotes(old => ({ ...old, [id]: "" }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Review failed."); }
    finally { setBusy(null); }
  };
  const controls = (kind: "payment" | "handover", id: string, status: string) => status === "pending" ? (
    <div className="space-y-2 mt-2">
      <Input aria-label="Verification evidence or discrepancy" placeholder="Evidence / discrepancy note (required)" value={notes[id] ?? ""} onChange={e => setNotes(old => ({ ...old, [id]: e.target.value }))} />
      <div className="flex gap-2"><Button disabled={busy !== null} onClick={() => decide(kind, id, "verified")}>Verify</Button><Button variant="outline" disabled={busy !== null} onClick={() => decide(kind, id, "disputed")}>Dispute</Button></div>
    </div>
  ) : <p className="text-xs text-muted-foreground mt-2">Reviewed: {status}</p>;
  return <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
    <h1 className="text-xl font-bold">Admin Collection Reconciliation</h1>
    <p className="text-sm text-muted-foreground">Review customer payments and staff handovers separately. A handover does not create another customer payment.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-sm">Branch<select className="w-full border rounded-md bg-background p-2 mt-1" value={chosen} onChange={e => setBranchId(e.target.value)}>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
      <label className="text-sm">Date<Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    </div>
    <Card><CardHeader><CardTitle>Customer payments ({queue?.payments.length ?? 0})</CardTitle></CardHeader><CardContent className="space-y-3">
      {queue?.payments.map(p => <div className="border rounded-lg p-3" key={p._id}>
        <div className="flex justify-between gap-2"><strong>GHS {money(p.amountGhs)}</strong><span className="text-sm">{p.reconciliationStatus}</span></div>
        <p className="text-xs text-muted-foreground">{p.receiptNumber ?? "Legacy receipt"} · {p.paymentMethod ?? "Unclassified legacy"} · {p.externalReference ?? "No reference"} · {p.recordedAt}</p>
        {controls("payment", p._id, p.reconciliationStatus)}
      </div>)}{queue && queue.payments.length === 0 && <p className="text-sm text-muted-foreground">No payments for this date.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Staff handovers ({queue?.handovers.length ?? 0})</CardTitle></CardHeader><CardContent className="space-y-3">
      {queue?.handovers.map(h => <div className="border rounded-lg p-3" key={h._id}>
        <div className="flex justify-between gap-2"><strong>GHS {money(h.amountGhs)}</strong><span className="text-sm">{h.status}</span></div>
        <p className="text-xs text-muted-foreground">{h.method} · {h.externalReference ?? "No reference"} · {h.recordedAt}</p>
        {controls("handover", h._id, h.status)}
      </div>)}{queue && queue.handovers.length === 0 && <p className="text-sm text-muted-foreground">No handovers for this date.</p>}
    </CardContent></Card>
  </div>;
}
