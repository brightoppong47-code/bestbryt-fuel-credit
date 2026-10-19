import {useState} from "react";
import {CustomerComplaints} from "./_components/CustomerComplaints";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { ShieldAlert, Phone, Hash, Car, CheckCircle2, UserX, Plus, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { format } from "date-fns";
import { PenaltyPauseButton } from "@/pages/credits/_components/PenaltyPauseButton.tsx";

function formatGhs(amount: number) {
  return `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskManagerPage() {
  const allAlerts = useQuery(api.transactions.getOverdueAlerts);
  const branches = useQuery(api.branches.listBranches);
  const settings = useQuery(api.appSettings.getAppSettings);
  const [branchId,setBranchId]=useState<Id<"branches">|undefined>();
  const alerts=allAlerts?.filter(alert=>!branchId || alert.branchId===branchId);
  const currentUser = useQuery(api.users.getCurrentUserData);
  const updateDriver = useMutation(api.drivers.updateDriver);

  const canDeactivate =
    currentUser?.role === "risk_manager" || currentUser?.role === "owner";

  const handleDeactivate = async (driverId: Id<"drivers">, driverName: string) => {
    try {
      await updateDriver({ driverId, isActive: false });
      toast.success(`${driverName} has been deactivated.`);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to deactivate driver.");
      }
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            Risk Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Drivers with payments overdue by 3 or more days
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5 shrink-0">
          <Link to="/drivers/new">
            <Plus className="w-3.5 h-3.5" />
            <span>Register Customer</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-1"><label htmlFor="risk-branch" className="text-sm font-medium">Branch / zone</label><select id="risk-branch" className="w-full border rounded-md bg-background p-2" value={branchId ?? ""} onChange={e=>setBranchId((e.target.value || undefined) as Id<"branches">|undefined)}><option value="">All assigned branches</option>{branches?.map(b=><option key={b._id} value={b._id}>{b.name}</option>)}</select></div>
      {settings?.riskManagementEnabled ? <CustomerComplaints key={branchId ?? "all"} branchId={branchId}/> : <p className="text-sm text-muted-foreground">The complaints feature will be available after the backend update is deployed.</p>}
      {/* Alert count banner */}
      {alerts !== undefined && alerts.length > 0 && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm font-semibold text-destructive">
            {alerts.length} overdue credit{alerts.length !== 1 ? "s" : ""} require immediate follow-up
          </p>
        </div>
      )}

      {/* Loading */}
      {alerts === undefined && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {alerts !== undefined && alerts.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
            <EmptyTitle>All clear</EmptyTitle>
            <EmptyDescription>
              No customers are 3 or more days overdue in this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Alert cards */}
      <div className="space-y-3">
        {alerts?.map((alert) => (
          <div
            key={alert._id}
            className="bg-card border rounded-xl p-4 space-y-3"
          >
            {/* Top row: driver info + overdue badge */}
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive font-bold text-base shrink-0">
                {alert.driverName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/drivers/${alert.driverId}`}
                    className="font-semibold hover:underline truncate"
                  >
                    {alert.driverName}
                  </Link>
                  <Badge variant="destructive" className="shrink-0">
                    {alert.overdueDays} day{alert.overdueDays !== 1 ? "s" : ""} overdue
                  </Badge>
                  {!alert.driverIsActive && (
                    <Badge variant="secondary" className="shrink-0">Deactivated</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{alert.branchName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span className="text-xs font-mono text-primary flex items-center gap-1">
                    <Hash className="w-3 h-3" />{alert.driverAccountNumber}
                  </span>
                  <a
                    href={`tel:${alert.driverPhone}`}
                    className="text-xs text-primary flex items-center gap-1 hover:underline font-medium"
                  >
                    <Phone className="w-3 h-3" />{alert.driverPhone}
                  </a>
                </div>
              </div>
            </div>

            {/* Amount breakdown */}
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Principal</p>
                <p className="text-sm font-semibold">{formatGhs(alert.totalOwedGhs)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Penalty</p>
                <p className="text-sm font-semibold text-destructive">{formatGhs(alert.penalty)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-sm font-bold">{formatGhs(alert.remaining)}</p>
              </div>
            </div>

            {/* Due date + transaction link */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Due: <span className="font-medium text-foreground">
                  {format(new Date(alert.dueAt), "dd MMM yyyy, h:mm a")}
                </span>
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="secondary" className="h-7 text-xs gap-1.5">
                  <Link to={`/credits/${alert._id}`}>View Transaction</Link>
                </Button>
                {canDeactivate && (
                  <PenaltyPauseButton
                    transactionId={alert._id}
                    penaltyPausedUntil={alert.penaltyPausedUntil}
                    penaltyPauseReason={alert.penaltyPauseReason}
                    compact
                  />
                )}
                {canDeactivate && alert.driverIsActive && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleDeactivate(alert.driverId, alert.driverName)}
                  >
                    <UserX className="w-3 h-3" />
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
