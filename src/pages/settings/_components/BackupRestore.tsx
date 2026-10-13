import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Download, Upload, AlertTriangle, Loader2, CheckCircle2, Database } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackupManifest {
  version: string;
  exportedAt: string;
  tables: {
    transactions: number;
    payments: number;
    drivers: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv(rows: Record<string, string>[], filename: string) {
  const csv = Papa.unparse(rows, { quotes: true, header: true });
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Backup & Restore Card ────────────────────────────────────────────────────

export function BackupRestore() {
  const convex = useConvex();
  const [loading, setLoading] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  // ── Full JSON backup ────────────────────────────────────────────────────────

  const handleFullBackup = async () => {
    setLoading("full");
    try {
      // Fetch all tables in parallel
      const [transactions, drivers, payments] = await Promise.all([
        convex.query(api.exports.getAllTransactionsForExport, {}),
        convex.query(api.exports.getAllDriversForExport, {}),
        convex.query(api.exports.getAllPaymentsForExport, {}),
      ]);

      const manifest: BackupManifest = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        tables: {
          transactions: transactions.length,
          payments: payments.length,
          drivers: drivers.length,
        },
      };

      const backup = { manifest, transactions, drivers, payments };
      downloadJson(backup, `BBV-Backup-${today}.json`);
      toast.success(`Backup complete — ${drivers.length} drivers, ${transactions.length} transactions, ${payments.length} payments.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setLoading(null);
    }
  };

  // ── CSV Export (all data) ───────────────────────────────────────────────────

  const handleCsvBackup = async () => {
    setLoading("csv");
    try {
      const [transactions, drivers, payments] = await Promise.all([
        convex.query(api.exports.getAllTransactionsForExport, {}),
        convex.query(api.exports.getAllDriversForExport, {}),
        convex.query(api.exports.getAllPaymentsForExport, {}),
      ]);

      downloadCsv(drivers as Record<string, string>[], `BBV-Drivers-${today}.csv`);
      await new Promise((r) => setTimeout(r, 300));
      downloadCsv(transactions as Record<string, string>[], `BBV-Transactions-${today}.csv`);
      await new Promise((r) => setTimeout(r, 300));
      downloadCsv(payments as Record<string, string>[], `BBV-Payments-${today}.csv`);

      toast.success("3 CSV files downloaded — Drivers, Transactions, and Payments.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV export failed.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Backup &amp; Restore
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Export all your data as a backup. The JSON backup can be used to restore or migrate data.
            CSV files open cleanly in Excel and Google Sheets.
          </p>

          {/* Download options */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={handleFullBackup}
              disabled={loading !== null}
              className="flex items-center gap-3 rounded-xl border p-3.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {loading === "full"
                  ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  : <Download className="w-4 h-4 text-primary" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Full Backup (JSON)</p>
                <p className="text-xs text-muted-foreground">All tables, all data</p>
              </div>
            </button>

            <button
              onClick={handleCsvBackup}
              disabled={loading !== null}
              className="flex items-center gap-3 rounded-xl border p-3.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                {loading === "csv"
                  ? <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
                  : <Download className="w-4 h-4 text-green-600 dark:text-green-400" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Export CSV Files</p>
                <p className="text-xs text-muted-foreground">3 files — Drivers, Transactions, Payments</p>
              </div>
            </button>
          </div>

          {/* Restore notice */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">About Restore</p>
              <p className="leading-relaxed">
                Data restore requires admin access. To restore from a JSON backup, contact your system administrator or use the Convex database dashboard in the Hercules App Builder (Advanced → Backend).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <RestoreInfoDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </>
  );
}

function RestoreInfoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Restore from Backup
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>Your JSON backup contains all drivers, transactions, and payment records.</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>To restore: go to <strong>Advanced → Backend</strong> in the Hercules App Builder and use the database dashboard to import your JSON file.</p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>Restoring will overwrite current data. Always take a fresh backup before restoring.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
