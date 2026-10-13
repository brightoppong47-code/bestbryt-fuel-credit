/**
 * Danger Zone — owner-only data clearing controls.
 * Each action has its own confirmation dialog with typed confirmation.
 * Also includes Delete Individual Customer with search + typed confirmation.
 */
import { useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  AlertTriangle, Trash2, Loader2, CreditCard, CalendarDays, MessageSquare,
  ShieldAlert, UserMinus, Search, User, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { useDebounce } from "@/hooks/use-debounce.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClearAction =
  | "transactions"
  | "eod_reports"
  | "message_logs"
  | "all";

interface ActionConfig {
  id: ClearAction;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  confirmWord: string;
  countKey?: "transactions" | "eodReports" | "messageLogs" | "drivers";
  countLabel?: string;
  isDangerous?: boolean;
}

const ACTIONS: ActionConfig[] = [
  {
    id: "transactions",
    label: "Clear Transactions & Payments",
    description: "Deletes all fuel credit transactions and every payment record. Driver accounts are kept.",
    icon: CreditCard,
    confirmWord: "DELETE TRANSACTIONS",
    countKey: "transactions",
    countLabel: "transactions",
  },
  {
    id: "eod_reports",
    label: "Clear EOD Reports",
    description: "Deletes all End-of-Day reports submitted by branch secretaries.",
    icon: CalendarDays,
    confirmWord: "DELETE REPORTS",
    countKey: "eodReports",
    countLabel: "reports",
  },
  {
    id: "message_logs",
    label: "Clear Message Logs",
    description: "Deletes all SMS and WhatsApp message logs. Does not affect transactions.",
    icon: MessageSquare,
    confirmWord: "DELETE LOGS",
    countKey: "messageLogs",
    countLabel: "logs",
  },
  {
    id: "all",
    label: "Clear ALL System Data",
    description:
      "Permanently deletes ALL transactions, payments, drivers, EOD reports and message logs. Users and branches are kept. This cannot be undone.",
    icon: ShieldAlert,
    confirmWord: "DELETE ALL DATA",
    isDangerous: true,
  },
];

// ─── Bulk clear confirmation dialog ──────────────────────────────────────────

function ConfirmClearDialog({
  action,
  onClose,
}: {
  action: ActionConfig;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  const clearTransactions = useMutation(api.admin.clearTransactions);
  const clearEodReports = useMutation(api.admin.clearEodReports);
  const clearMessageLogs = useMutation(api.admin.clearMessageLogs);
  const clearAllData = useMutation(api.admin.clearAllData);

  const confirmed = typed.trim() === action.confirmWord;

  const handleConfirm = async () => {
    if (!confirmed) return;
    setLoading(true);
    try {
      let result: { deleted: number };
      if (action.id === "transactions") result = await clearTransactions({});
      else if (action.id === "eod_reports") result = await clearEodReports({});
      else if (action.id === "message_logs") result = await clearMessageLogs({});
      else result = await clearAllData({});
      toast.success(`Done — ${result.deleted} record${result.deleted !== 1 ? "s" : ""} deleted.`);
      onClose();
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to clear data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            {action.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-destructive">This action is permanent and cannot be undone.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{action.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-input" className="text-sm">
              Type{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono font-bold text-destructive">
                {action.confirmWord}
              </code>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-input"
              placeholder={action.confirmWord}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={cn(
                "font-mono transition-colors",
                typed.length > 0 && !confirmed && "border-destructive/50",
                confirmed && "border-green-500"
              )}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!confirmed || loading}
            onClick={handleConfirm}
            className="gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Deleting…" : "Permanently Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete individual customer dialog ───────────────────────────────────────

type DriverRow = {
  _id: Id<"drivers">;
  fullName: string;
  accountNumber: string;
  phone: string;
  isActive: boolean;
};

function DeleteCustomerDialog({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  const deleteDriver = useMutation(api.admin.deleteDriver);

  const { results: drivers, status } = usePaginatedQuery(
    api.drivers.listDrivers,
    { search: debouncedSearch || undefined },
    { initialNumItems: 20 }
  );

  const confirmWord = selected ? `DELETE ${selected.fullName.toUpperCase()}` : "";
  const confirmed = typed.trim() === confirmWord;

  const handleDelete = async () => {
    if (!selected || !confirmed) return;
    setLoading(true);
    try {
      const result = await deleteDriver({ driverId: selected._id });
      toast.success(`${selected.fullName} deleted — ${result.deleted} record${result.deleted !== 1 ? "s" : ""} removed.`);
      onClose();
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to delete customer. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserMinus className="w-5 h-5" />
            Delete Customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Warning */}
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 space-y-1">
            <p className="text-sm font-semibold text-destructive">This permanently deletes the customer and all their data.</p>
            <p className="text-xs text-muted-foreground">All transactions, payments, and records linked to this customer will be removed. This cannot be undone.</p>
          </div>

          {/* Step 1 — search & select */}
          {!selected ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Step 1 — Find the customer</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, account no., or phone…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="rounded-xl border overflow-hidden max-h-60 overflow-y-auto">
                {status === "LoadingFirstPage" ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="p-3 border-b last:border-0">
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ))
                ) : drivers.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {search ? "No customers match your search." : "No customers found."}
                  </div>
                ) : (
                  drivers.map((d) => (
                    <button
                      key={d._id}
                      onClick={() => { setSelected(d); setTyped(""); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-0 text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{d.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.accountNumber}</p>
                      </div>
                      <Badge variant={d.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                        {d.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Step 2 — confirm deletion */
            <div className="space-y-4">
              <p className="text-sm font-medium">Step 2 — Confirm deletion</p>

              {/* Selected customer card */}
              <div className="rounded-xl border bg-muted/40 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <UserMinus className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{selected.fullName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selected.accountNumber} · {selected.phone}</p>
                </div>
                <button
                  onClick={() => { setSelected(null); setTyped(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Typed confirmation */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Type{" "}
                  <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono font-bold text-destructive">
                    {confirmWord}
                  </code>{" "}
                  to confirm
                </Label>
                <Input
                  placeholder={confirmWord}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className={cn(
                    "font-mono text-sm transition-colors",
                    typed.length > 0 && !confirmed && "border-destructive/50",
                    confirmed && "border-green-500"
                  )}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          {selected && (
            <Button
              variant="destructive"
              disabled={!confirmed || loading}
              onClick={handleDelete}
              className="gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Deleting…" : "Delete Customer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DangerZone() {
  const summary = useQuery(api.admin.getDataSummary);
  const [pending, setPending] = useState<ActionConfig | null>(null);
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);

  const getCount = (key?: ActionConfig["countKey"]): string => {
    if (!key || !summary) return "";
    const n = summary[key];
    return n === undefined ? "" : ` (${n.toLocaleString()})`;
  };

  return (
    <div className="space-y-4">
      {/* ── Delete individual customer ──────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <UserMinus className="w-4 h-4" />
            Delete Customer
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Permanently remove a single customer and all their linked transactions and payments.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <UserMinus className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">Remove Individual Customer</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Search for a customer, then type their name to confirm permanent deletion.
                {summary !== undefined && (
                  <span className="ml-1 font-medium text-foreground">
                    {summary.drivers.toLocaleString()} customer{summary.drivers !== 1 ? "s" : ""} in system.
                  </span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 shrink-0"
              onClick={() => setDeleteCustomerOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Bulk clear actions ──────────────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These actions permanently delete data. They cannot be undone.
            Always download a backup first from the <span className="font-medium text-foreground">Backup</span> tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary === undefined ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : (
            ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <div
                  key={action.id}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border p-4",
                    action.isDangerous
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border bg-card"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    action.isDangerous
                      ? "bg-destructive text-white"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-semibold",
                      action.isDangerous && "text-destructive"
                    )}>
                      {action.label}
                      {action.countKey && (
                        <span className="font-normal text-muted-foreground text-xs ml-1">
                          {getCount(action.countKey)} {action.countLabel}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={action.isDangerous ? "destructive" : "secondary"}
                    className="gap-1.5 shrink-0"
                    onClick={() => setPending(action)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {pending && (
        <ConfirmClearDialog
          action={pending}
          onClose={() => setPending(null)}
        />
      )}

      {deleteCustomerOpen && (
        <DeleteCustomerDialog onClose={() => setDeleteCustomerOpen(false)} />
      )}
    </div>
  );
}
