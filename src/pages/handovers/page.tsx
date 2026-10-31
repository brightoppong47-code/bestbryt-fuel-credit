import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type HandoverMethod = "cash" | "company_momo";
export default function CollectionHandoverPage() {
  const user = useQuery(api.users.getCurrentUserData);
  const branches = useQuery(api.branches.listBranches);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [amount, setAmount] = useState("");
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<HandoverMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const recordHandover = useMutation(api.collectionReconciliation.recordHandover);
  const branchId = selectedBranch || user?.branchId || branches?.[0]?._id || "";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) { toast.error("Enter a positive amount with at most two decimal places."); return; }
    if (method === "company_momo" && !reference.trim()) { toast.error("Enter the company MoMo transfer reference."); return; }
    if (!branchId) { toast.error("Choose your assigned branch."); return; }
    setSaving(true);
    try {
      await recordHandover({
        branchId: branchId as Id<"branches">,
        amountGhs: value,
        collectionDate,
        method,
        externalReference: method === "company_momo" ? reference.trim() : undefined,
        note: note.trim() || undefined,
      });
      toast.success("Handover recorded; awaiting admin verification.");
      setAmount(""); setReference(""); setNote("");
    } catch (err) {
      toast.error(err instanceof ConvexError ? String((err.data as {message?: string}).message ?? "Handover failed") : "Handover failed.");
    } finally { setSaving(false); }
  };
  return <div className="p-4 md:p-6 max-w-xl mx-auto space-y-5">
    <h1 className="text-xl font-bold">Staff Collection Handover</h1>
    <p className="text-sm text-muted-foreground">Record money handed to the business. This is not a new customer payment and does not reduce customer debt again.</p>
    <Card><CardHeader><CardTitle>New handover</CardTitle></CardHeader><CardContent>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Branch
          <select className="mt-1 w-full border rounded-md bg-background p-2" value={branchId} onChange={e => setSelectedBranch(e.target.value)}>
            {branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Collection date<Input className="mt-1" type="date" required max={new Date().toISOString().slice(0, 10)} value={collectionDate} onChange={e => setCollectionDate(e.target.value)} /></label>
        <label className="block text-sm">Amount (GHS)<Input className="mt-1" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="block text-sm">How money was handed over
          <select className="mt-1 w-full border rounded-md bg-background p-2" value={method} onChange={e => { setMethod(e.target.value as HandoverMethod); setReference(""); }}>
            <option value="cash">Cash handed to business</option><option value="company_momo">Transferred to company MoMo</option>
          </select>
        </label>
        {method === "company_momo" && <label className="block text-sm">MoMo transfer reference<Input className="mt-1" required maxLength={120} value={reference} onChange={e => setReference(e.target.value)} /></label>}
        <label className="block text-sm">Handover note (optional)<Input className="mt-1" value={note} onChange={e => setNote(e.target.value)} placeholder="Who received it / related collection period" /></label>
        <Button type="submit" disabled={saving || !branchId}>{saving ? "Saving..." : "Record handover"}</Button>
      </form>
    </CardContent></Card>
  </div>;
}
