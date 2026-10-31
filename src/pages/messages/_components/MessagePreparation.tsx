import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildMessageDraft } from "./messageDraft";

function CustomerPreview({ customer, kind, text, channel }: { customer: Doc<"drivers">; kind: "balance" | "general"; text: string; channel: "sms" | "whatsapp" | "both" }) {
  const balance = useQuery(api.transactions.getDriverBalance, kind === "balance" ? { driverId: customer._id } : "skip");
  const body = buildMessageDraft(customer, kind, text, balance?.totalOwed);
  const copy = async () => {
    if (!body) return;
    try { await navigator.clipboard.writeText(body); toast.success("Draft copied. No message was sent."); }
    catch { toast.error("Copy unavailable. Select the preview text and copy it manually."); }
  };
  return <div className="rounded-lg border p-3 space-y-2">
    <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold text-sm">{customer.fullName}</p><p className="text-xs text-muted-foreground">{customer.accountNumber} · {customer.phone || "No phone number"}</p></div><span className="text-xs font-medium">{channel === "both" ? "SMS + WhatsApp" : channel === "sms" ? "SMS" : "WhatsApp"} · Draft</span></div>
    {kind === "balance" && !balance ? <p role="status" className="text-sm">Loading current app balance...</p> : body ? <>
      {kind === "balance" && balance?.totalOwed === 0 && <p className="text-sm text-green-700">No outstanding balance. No reminder needed.</p>}
      <pre className="whitespace-pre-wrap break-words font-sans text-sm bg-muted/50 rounded-lg p-3">{body}</pre>
      <Button variant="outline" size="sm" onClick={copy}>Copy draft</Button><p className="text-xs text-muted-foreground">{body.length} characters. Actual SMS segments and charges depend on encoding.</p>
    </> : <p className="text-sm text-muted-foreground">Enter your general message to preview it.</p>}
  </div>;
}

export default function MessagePreparation() {
  const branches = useQuery(api.branches.listBranches);
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Doc<"drivers">[]>([]);
  const [kind, setKind] = useState<"balance" | "general">("balance");
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "both">("both");
  const [text, setText] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(api.drivers.listDrivers, branchId === "all" ? {} : { branchId: branchId as Doc<"drivers">["branchId"] }, { initialNumItems: 30 });
  const visible = results.filter(d => d.isActive && `${d.fullName} ${d.accountNumber} ${d.phone}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (d: Doc<"drivers">) => setSelected(old => old.some(x => x._id === d._id) ? old.filter(x => x._id !== d._id) : old.length >= 50 ? old : [...old, d]);
  return <section className="space-y-4">
    <Card className="border-amber-300"><CardContent className="p-4 space-y-1"><h2 className="font-semibold">Prepare now, activate sending later</h2><p className="text-sm text-muted-foreground">SMS and WhatsApp previews are ready to prepare. Twilio activation is pending. Selecting customers, previewing and copying drafts does not send messages or use messaging credit.</p><p className="text-xs text-muted-foreground">Before activation, we will connect the sender numbers, approve WhatsApp templates and record customer messaging preferences.</p></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">1. Choose customers</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Branch<select value={branchId} onChange={e => { setBranchId(e.target.value); setSelected([]); }} className="w-full border p-2 rounded-md bg-background mt-1"><option value="all">All accessible branches</option>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label><label className="text-sm">Search loaded customers<Input className="mt-1" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, account or phone" /></label></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setSelected(old => [...old, ...visible.filter(d => !old.some(x => x._id === d._id))].slice(0, 50))}>Select visible customers</Button><Button variant="outline" size="sm" onClick={() => setSelected([])}>Clear selection</Button></div>
      <p className="text-xs text-muted-foreground">{selected.length} selected (up to 50 drafts). Staff see only their assigned branches. Load more to search additional customers.</p>
      <div className="max-h-64 overflow-y-auto divide-y border rounded-lg">{visible.map(d => <label key={d._id} className="flex gap-3 p-3 items-center text-sm"><input type="checkbox" checked={selected.some(x => x._id === d._id)} disabled={selected.length >= 50 && !selected.some(x => x._id === d._id)} onChange={() => toggle(d)} /><span><span className="font-medium">{d.fullName}</span><span className="block text-xs text-muted-foreground">{d.accountNumber} · {d.phone}</span></span></label>)}{status === "LoadingFirstPage" ? <p role="status" className="p-3 text-sm">Loading customers...</p> : !visible.length && <p className="p-3 text-sm">No matching active customers in the loaded results.</p>}</div>
      {(status === "CanLoadMore" || status === "LoadingMore") && <Button variant="outline" disabled={status === "LoadingMore"} onClick={() => loadMore(30)}>{status === "LoadingMore" ? "Loading..." : "Load more customers"}</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">2. Prepare your message</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Channel<select value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className="w-full border p-2 rounded-md bg-background mt-1"><option value="both">SMS + WhatsApp</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></label><label className="text-sm">Message type<select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="w-full border p-2 rounded-md bg-background mt-1"><option value="balance">Balance reminder</option><option value="general">General message</option></select></label></div>
      {kind === "general" && <label className="block text-sm">General message<Textarea className="mt-1" value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={4} placeholder="Write your customer announcement..." /><span className="text-xs text-muted-foreground">{text.length}/1000 characters. Customer name and account are added automatically.</span></label>}
      {kind === "balance" && <p className="text-xs text-muted-foreground">Uses the same current balance estimate as the app, including its calculated penalties. Recheck balances and customer phone numbers before sending. A preview is not a payment demand sent to the customer.</p>}
      {channel !== "sms" && <p className="text-xs text-muted-foreground">WhatsApp text shown here is a draft; production sending will use approved templates where required.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">3. Preview only — nothing sent</CardTitle></CardHeader><CardContent className="space-y-3">{selected.length ? selected.map(d => <CustomerPreview key={d._id} customer={d} kind={kind} text={text} channel={channel} />) : <p className="text-sm text-muted-foreground">Select a customer above to preview your message.</p>}<Button disabled className="w-full">Sending pending Twilio activation</Button></CardContent></Card>
  </section>;
}
