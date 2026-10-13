import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { format } from "date-fns";

// ─── CSV download helper ──────────────────────────────────────────────────────

function downloadCsv(rows: Record<string, string>[], filename: string) {
  if (rows.length === 0) {
    toast.error("No data to export for the selected filters.");
    return false;
  }
  const csv = Papa.unparse(rows, { quotes: true, header: true });
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

// ─── Export dialog ────────────────────────────────────────────────────────────

type ExportType = "transactions" | "drivers" | "payments";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  branches?: Array<{ _id: Id<"branches">; name: string; code: string }>;
}

export function ExportDialog({ open, onClose, branches }: ExportDialogProps) {
  const convex = useConvex();
  const today = format(new Date(), "yyyy-MM-dd");
  const thirtyDaysAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const [exportType, setExportType] = useState<ExportType>("transactions");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [branchId, setBranchId] = useState("all");
  const [activeOnly, setActiveOnly] = useState("all");
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const dateStr = `${fromDate}_to_${toDate}`;

      if (exportType === "transactions") {
        const rows = await convex.query(api.exports.getAllTransactionsForExport, {
          status: status as "all" | "pending" | "paid" | "overdue",
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        const ok = downloadCsv(
          rows as Record<string, string>[],
          `BBV-transactions-${dateStr}.csv`
        );
        if (ok) toast.success(`Exported ${rows.length} transaction${rows.length !== 1 ? "s" : ""}`);
      } else if (exportType === "drivers") {
        const rows = await convex.query(api.exports.getAllDriversForExport, {
          branchId: branchId !== "all" ? branchId as Id<"branches"> : undefined,
          activeOnly: activeOnly === "active",
        });
        const ok = downloadCsv(
          rows as Record<string, string>[],
          `BBV-drivers-${format(new Date(), "yyyy-MM-dd")}.csv`
        );
        if (ok) toast.success(`Exported ${rows.length} driver${rows.length !== 1 ? "s" : ""}`);
      } else {
        const rows = await convex.query(api.exports.getAllPaymentsForExport, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        const ok = downloadCsv(
          rows as Record<string, string>[],
          `BBV-payments-${dateStr}.csv`
        );
        if (ok) toast.success(`Exported ${rows.length} payment record${rows.length !== 1 ? "s" : ""}`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const showDateRange = exportType === "transactions" || exportType === "payments";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Export to CSV / Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Export type */}
          <div className="space-y-1.5">
            <Label>What to export</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "transactions", label: "Transactions" },
                { id: "payments", label: "Payments" },
                { id: "drivers", label: "Drivers" },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setExportType(id)}
                  className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    exportType === id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range (transactions + payments) */}
          {showDateRange && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From date</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To date</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          )}

          {/* Status filter (transactions only) */}
          {exportType === "transactions" && (
            <div className="space-y-1.5">
              <Label>Status filter</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending only</SelectItem>
                  <SelectItem value="overdue">Overdue only</SelectItem>
                  <SelectItem value="paid">Paid only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Driver-specific filters */}
          {exportType === "drivers" && (
            <>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches?.map((b) => (
                      <SelectItem key={b._id} value={b._id}>{b.name} ({b.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Active status</Label>
                <Select value={activeOnly} onValueChange={setActiveOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Active & inactive</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* What's included note */}
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 p-3">
            {exportType === "transactions" && "Includes: driver info, credit amounts, interest, penalties, payment status, and remaining balance."}
            {exportType === "payments" && "Includes: payment date, driver info, amount received, branch, and recorded-by staff."}
            {exportType === "drivers" && "Includes: account number, contact info, vehicle, branch, outstanding balance summary, and transaction counts."}
            {" "}The file opens directly in Excel or Google Sheets.
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleExport} disabled={loading} className="gap-2">
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</>
              : <><Download className="w-4 h-4" />Download CSV</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compact export button (for use inline in Reports page) ───────────────────

export function ExportButton({ branches }: {
  branches?: Array<{ _id: Id<"branches">; name: string; code: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary" size="sm" className="gap-2 shrink-0">
        <Download className="w-4 h-4" />
        Export
      </Button>
      <ExportDialog open={open} onClose={() => setOpen(false)} branches={branches} />
    </>
  );
}
