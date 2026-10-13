import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Users, Fuel, Banknote, TrendingUp, CheckCircle2,
  ClipboardCheck, Loader2, AlertTriangle, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatTile({
  icon: Icon, label, value, sub, color = "text-primary", bg = "bg-primary/10",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  bg?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EodPage() {
  const currentUser = useQuery(api.users.getCurrentUserData);

  // Today's date in YYYY-MM-DD local time
  const today = format(new Date(), "yyyy-MM-dd");

  const branchId = currentUser?.branchId;
  const branch = useQuery(
    api.branches.getBranch,
    branchId ? { branchId } : "skip"
  );

  const stats = useQuery(
    api.eod.getTodayStats,
    branchId ? { branchId, reportDate: today } : "skip"
  );

  const alreadySubmitted = useQuery(
    api.eod.checkEodSubmitted,
    branchId ? { branchId, reportDate: today } : "skip"
  );

  const submitReport = useMutation(api.eod.submitEodReport);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!branchId || !stats) return;
    setSubmitting(true);
    try {
      await submitReport({
        branchId,
        reportDate: today,
        customersServed: stats.customersServed,
        creditsIssuedCount: stats.creditsIssuedCount,
        creditsIssuedGhs: stats.creditsIssuedGhs,
        interestCollectedGhs: stats.interestCollectedGhs,
        paymentsReceivedCount: stats.paymentsReceivedCount,
        paymentsReceivedGhs: stats.paymentsReceivedGhs,
        penaltiesCollectedGhs: stats.penaltiesCollectedGhs,
        notes: notes.trim() || undefined,
      });
      toast.success("Day closed successfully! Report sent to admin.");
      setConfirmOpen(false);
      setNotes("");
    } catch (err) {
      toast.error(
        err instanceof ConvexError
          ? (err.data as { message: string }).message
          : "Failed to submit report."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // No branch assigned
  if (currentUser && !branchId) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Building2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-bold text-lg">No Branch Assigned</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            You don't have a branch assigned yet. Ask your admin to assign you to a branch from Settings.
          </p>
        </div>
      </div>
    );
  }

  const loading = currentUser === undefined || stats === undefined || alreadySubmitted === undefined;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          End of Day Report
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {branch?.name ?? "Your Branch"} · {format(new Date(), "EEEE, dd MMM yyyy")}
        </p>
      </div>

      {/* Already submitted banner */}
      {alreadySubmitted && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-green-700 dark:text-green-400">Day already closed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Report submitted at {format(new Date(alreadySubmitted.submittedAt), "h:mm a")}. Admin has been notified.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={Users}
              label="Customers Served"
              value={String(stats.customersServed)}
              sub="Unique drivers"
            />
            <StatTile
              icon={Fuel}
              label="Fuel Credits Issued"
              value={`GHS ${fmt(stats.creditsIssuedGhs)}`}
              sub={`${stats.creditsIssuedCount} transaction${stats.creditsIssuedCount !== 1 ? "s" : ""}`}
            />
            <StatTile
              icon={Banknote}
              label="Payments Received"
              value={`GHS ${fmt(stats.paymentsReceivedGhs)}`}
              sub={`${stats.paymentsReceivedCount} payment${stats.paymentsReceivedCount !== 1 ? "s" : ""}`}
              color="text-green-700 dark:text-green-400"
              bg="bg-green-500/10"
            />
            <StatTile
              icon={TrendingUp}
              label="Interest Collected"
              value={`GHS ${fmt(stats.interestCollectedGhs)}`}
              sub="On today's credits"
              color="text-primary"
              bg="bg-primary/10"
            />
            <StatTile
              icon={AlertTriangle}
              label="Penalties Collected"
              value={`GHS ${fmt(stats.penaltiesCollectedGhs)}`}
              sub="From overdue payments"
              color="text-destructive"
              bg="bg-destructive/10"
            />
            <StatTile
              icon={TrendingUp}
              label="Total Revenue Today"
              value={`GHS ${fmt(stats.paymentsReceivedGhs)}`}
              sub="Cash received"
              color="text-primary"
              bg="bg-primary/10"
            />
          </div>

          {/* Summary box */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Today's Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credits issued</span>
                <span className="font-semibold">GHS {fmt(stats.creditsIssuedGhs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest earned</span>
                <span className="font-semibold">GHS {fmt(stats.interestCollectedGhs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Penalties earned</span>
                <span className="font-semibold">GHS {fmt(stats.penaltiesCollectedGhs)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-medium">Cash Received</span>
                <span className="font-bold text-green-700 dark:text-green-400">GHS {fmt(stats.paymentsReceivedGhs)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Close Day button */}
          {!alreadySubmitted && (
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={() => setConfirmOpen(true)}
            >
              <CheckCircle2 className="w-5 h-5" />
              Close Day & Send Report
            </Button>
          )}
        </>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm End-of-Day Close</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">
              This will send today's report to the admin. You can only submit once per day.
            </p>
            {stats && (
              <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customers</span>
                  <span className="font-semibold">{stats.customersServed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credits Issued</span>
                  <span className="font-semibold">GHS {fmt(stats.creditsIssuedGhs)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash Received</span>
                  <span className="font-semibold text-green-700 dark:text-green-400">GHS {fmt(stats.paymentsReceivedGhs)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest + Penalties</span>
                  <span className="font-semibold">GHS {fmt(stats.interestCollectedGhs + stats.penaltiesCollectedGhs)}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Any issues, unusual activity, or comments for the admin..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm & Close Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
