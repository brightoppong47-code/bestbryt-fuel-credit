import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const money = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export default function CustomerStatementReport() {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState(() => new Date().getFullYear() + "-01-01");
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Array<{ _id: Id<"drivers">; fullName: string; accountNumber: string }>>([]);
  const [busy, setBusy] = useState(false);
  const page = useQuery(api.drivers.listDrivers, { paginationOpts: { numItems: 100, cursor } });
  const customers = cursor === null ? (page?.page ?? []) : [...loaded, ...(page?.page ?? []).filter(c => !loaded.some(d => d._id === c._id))];
  const filtered = customers.filter(c => (c.fullName + " " + c.accountNumber).toLowerCase().includes(search.toLowerCase()));
  const valid = validDate(from) && validDate(to) && from <= to;
  const statement = useQuery(api.customerStatements.statement, customerId && valid ? { driverId: customerId as Id<"drivers">, fromDate: from, toDate: to } : "skip");

  const download = async () => {
    if (!statement) return;
    setBusy(true);
    try {
      const doc = new jsPDF();
      const width = doc.internal.pageSize.getWidth();
      doc.setFillColor(23, 49, 80); doc.rect(0, 0, width, 34, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(17); doc.setFont("helvetica", "bold");
      doc.text("BESTBRYT VENTURES", 14, 16);
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("CUSTOMER ACCOUNT STATEMENT", 14, 25);
      doc.setTextColor(30, 41, 59); doc.setFontSize(10);
      doc.text("Customer: " + statement.customer.name, 14, 43);
      doc.text("Account: " + statement.customer.account, 14, 50);
      doc.text("Branch: " + statement.customer.branch, 14, 57);
      doc.text("Phone: " + statement.customer.phone, 14, 64);
      doc.text("Period: " + from + " to " + to, 14, 71);
      doc.text("Generated: " + new Date(statement.generatedAt).toLocaleString("en-GH"), 14, 78);
      doc.setFont("helvetica", "bold");
      doc.text("Opening ledger: GHS " + money(statement.openingLedgerGhs), 14, 89);
      doc.text("Charges: GHS " + money(statement.debitGhs), 14, 96);
      doc.text("Payments / credits: GHS " + money(statement.creditGhs), 14, 103);
      doc.text("Closing ledger: GHS " + money(statement.closingLedgerGhs), 14, 110);
      doc.text("Current outstanding: GHS " + money(statement.currentOutstandingGhs), 14, 117);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("Current assessed penalties: GHS " + money(statement.currentPenaltyGhs), 14, 123);
      autoTable(doc, {
        startY: 130,
        head: [["Date", "Activity", "Reference", "Details", "Debit (GHS)", "Credit (GHS)"]],
        body: statement.rows.map(r => [r.date.slice(0, 16).replace("T", " "), r.type, r.reference.slice(-10), r.description, money(r.debitGhs), money(r.creditGhs)]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [23, 49, 80] },
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
        didDrawPage: () => {
          doc.setFontSize(8); doc.setTextColor(110, 110, 110);
          doc.text("BESTBRYT VENTURES | Customer statement", 14, doc.internal.pageSize.getHeight() - 8);
        },
      });
      const lastY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 135;
      if (lastY > doc.internal.pageSize.getHeight() - 36) doc.addPage();
      const noteY = lastY > doc.internal.pageSize.getHeight() - 36 ? 18 : lastY + 9;
      doc.setFontSize(8); doc.setTextColor(70, 70, 70);
      const lines = doc.splitTextToSize(statement.note, width - 28) as string[];
      doc.text(lines, 14, noteY);
      doc.save("BESTBRYT-statement-" + statement.customer.account.replace(/[^a-zA-Z0-9-]/g, "") + "-" + from + "-to-" + to + ".pdf");
      toast.success("Customer statement PDF downloaded.");
    } catch (e) {
      toast.error("Could not create statement PDF.");
    } finally { setBusy(false); }
  };

  return <Card><CardContent className="p-4 space-y-4">
    <div><h2 className="font-bold text-lg">Customer statement</h2><p className="text-sm text-muted-foreground">Select one customer and a period to download a printable statement. Read-only; no balances are changed.</p></div>
    <label className="block text-sm font-medium">Find customer by name or account number<Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search loaded customers" /></label>
    <label className="block text-sm font-medium">Customer<select aria-label="Customer" className="w-full border rounded-md p-2 bg-background" value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Select customer</option>{filtered.map(c => <option key={c._id} value={c._id}>{c.fullName} ({c.accountNumber})</option>)}{customerId && !filtered.some(c => c._id === customerId) && <option value={customerId}>Selected customer</option>}</select></label>
    {page && !page.isDone && <Button variant="outline" onClick={() => { setLoaded(customers); setCursor(page.continueCursor); }}>Load more customers</Button>}
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-sm">To<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    {!valid && <p role="alert" className="text-destructive text-sm">Choose a valid date range.</p>}
    {customerId && valid && !statement && <p role="status">Loading statement...</p>}
    {statement && <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-3"><p className="text-muted-foreground">Opening ledger</p><strong>GHS {money(statement.openingLedgerGhs)}</strong></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground">Closing ledger</p><strong>GHS {money(statement.closingLedgerGhs)}</strong></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground">Total payments / credits</p><strong>GHS {money(statement.creditGhs)}</strong></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground">Current outstanding</p><strong>GHS {money(statement.currentOutstandingGhs)}</strong></div>
      </div>
      <p className="text-xs text-muted-foreground">{statement.note}</p>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{["Date", "Activity", "Details", "Debit", "Credit"].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{statement.rows.map((r,i) => <tr key={i} className="border-t"><td className="p-2 whitespace-nowrap">{r.date.slice(0,10)}</td><td className="p-2">{r.type}</td><td className="p-2">{r.description}</td><td className="p-2">{money(r.debitGhs)}</td><td className="p-2">{money(r.creditGhs)}</td></tr>)}</tbody></table></div>
      {!statement.rows.length && <p className="text-sm">No account movements in this period.</p>}
      <Button disabled={busy} onClick={download}>{busy ? "Preparing PDF..." : "Download / Print statement PDF"}</Button>
    </div>}
  </CardContent></Card>;
}
