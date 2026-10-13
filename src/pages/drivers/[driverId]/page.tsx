import { useQuery, usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { ArrowLeft, Phone, Car, MapPin, User, FileText, Plus, Hash, Building2, Fuel, UserCheck, UserX, Loader2, Expand, X as XIcon, Pencil } from "lucide-react";
import { StatusBadge, DueCountdown, fmt, fmtDate } from "../../credits/_components/TransactionUtils.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useState } from "react";
import { toast } from "sonner";
import { EditDriverDialog } from "../_components/EditDriverDialog.tsx";
import { useQuery as useConvexCurrentUser } from "convex/react";
import { api as convexApi } from "@/convex/_generated/api.js";

export default function DriverProfilePage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const driver = useQuery(
    api.drivers.getDriver,
    driverId ? { driverId: driverId as Id<"drivers"> } : "skip"
  );
  const balance = useQuery(
    api.transactions.getDriverBalance,
    driverId ? { driverId: driverId as Id<"drivers"> } : "skip"
  );
  const { results: txs, status: txStatus } = usePaginatedQuery(
    api.transactions.listTransactions,
    driverId ? { driverId: driverId as Id<"drivers"> } : "skip",
    { initialNumItems: 20 }
  );
  const updateDriver = useMutation(api.drivers.updateDriver);
  const currentUser = useConvexCurrentUser(convexApi.users.getCurrentUserData, {});

  const [confirmDialog, setConfirmDialog] = useState<"deactivate" | "reactivate" | null>(null);
  const [updating, setUpdating] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isOwner = currentUser?.role === "owner";

  const handleToggleActive = async (activate: boolean) => {
    if (!driverId) return;
    setUpdating(true);
    try {
      await updateDriver({ driverId: driverId as Id<"drivers">, isActive: activate });
      toast.success(activate ? "Customer reactivated successfully." : "Customer deactivated.");
    } catch {
      toast.error("Failed to update customer status.");
    } finally {
      setUpdating(false);
      setConfirmDialog(null);
    }
  };

  if (driver === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Driver not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/drivers")}>
          Back to Drivers
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/drivers")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Driver Profile</h1>
          <p className="text-muted-foreground text-sm">View driver details and credit history</p>
        </div>
        {isOwner && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 shrink-0"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit Profile</span>
          </Button>
        )}
      </div>

      {/* Account number banner */}
      <div className="rounded-xl bg-primary px-5 py-4 flex items-center gap-4">
        <Hash className="w-6 h-6 text-primary-foreground/70 shrink-0" />
        <div>
          <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider">Account Number</p>
          <p className="text-primary-foreground font-mono font-bold text-xl tracking-widest">
            {driver.accountNumber}
          </p>
          {driver.branch && (
            <p className="text-primary-foreground/60 text-xs mt-0.5">{driver.branch.name} Branch</p>
          )}
        </div>
        <div className="ml-auto text-right">
          <Button asChild size="sm" className="gap-1.5 bg-white/20 hover:bg-white/30 text-white border-0">
            <Link to={`/credits/new?driverId=${driver._id}`}>
              <Plus className="w-3.5 h-3.5" /> Issue Credit
            </Link>
          </Button>
        </div>
      </div>

      {/* Balance summary */}
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-card border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Owed</p>
            <p className="font-bold text-primary text-base mt-0.5">GHS {fmt(balance.totalOwed)}</p>
          </div>
          <div className="rounded-xl bg-card border p-3 text-center">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className={`font-bold text-base mt-0.5 ${balance.overdueCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {balance.overdueCount}
            </p>
          </div>
          <div className="rounded-xl bg-card border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="font-bold text-green-600 text-base mt-0.5">{balance.paidCount}</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="credits">Credit History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="pt-0">
            {driver.photoUrl ? (
              <div className="relative">
                <img
                  src={driver.photoUrl}
                  alt={driver.fullName}
                  className="w-full aspect-[3/4] object-cover object-top rounded-t-xl cursor-zoom-in"
                  onClick={() => setPhotoPreviewOpen(true)}
                />
                {/* gradient overlay so name is readable */}
                <div className="absolute bottom-0 left-0 right-0 rounded-t-none bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 py-3">
                  <h2 className="text-white font-bold text-lg leading-tight">{driver.fullName}</h2>
                  <p className="text-white/80 text-sm">{driver.vehicleType}</p>
                </div>
                {/* tap-to-expand hint */}
                <div className="absolute top-3 right-3 bg-black/40 rounded-full p-1.5">
                  <Expand className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            ) : (
              <div className="w-full h-28 bg-primary/10 rounded-t-xl flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                  {driver.fullName.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <CardContent className="pt-4 space-y-3">
              {!driver.photoUrl && (
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-lg font-bold">{driver.fullName}</h2>
                    <p className="text-sm text-muted-foreground">{driver.vehicleType}</p>
                  </div>
                  <Badge variant={driver.isActive ? "default" : "secondary"}>
                    {driver.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              )}
              {driver.photoUrl && (
                <div className="flex justify-end">
                  <Badge variant={driver.isActive ? "default" : "secondary"}>
                    {driver.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={driver.phone} />
                <InfoRow icon={<Car className="w-4 h-4" />} label="Plate Number" value={driver.vehiclePlate} />
                <InfoRow icon={<User className="w-4 h-4" />} label="Home Address" value={driver.address} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="GPS" value={`${driver.gpsLatitude.toFixed(5)}, ${driver.gpsLongitude.toFixed(5)}`} />
                {driver.branch && (
                  <InfoRow icon={<Building2 className="w-4 h-4" />} label="Branch" value={`${driver.branch.name} (${driver.branch.code})`} />
                )}
                {driver.witnessName && (
                  <InfoRow icon={<User className="w-4 h-4" />} label="Witness" value={driver.witnessName} />
                )}
                {driver.witnessPhone && (
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="Witness Phone" value={driver.witnessPhone} />
                )}
              </div>
              {driver.gpsAddress && (
                <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground flex gap-2">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>{driver.gpsAddress}</span>
                </div>
              )}
              {driver.notes && (
                <div className="flex gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{driver.notes}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="mt-4 space-y-3">
          {txStatus === "LoadingFirstPage" && (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          )}
          {txStatus !== "LoadingFirstPage" && txs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Fuel className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No credits issued yet.
            </div>
          )}
          {txs.map((tx) => (
            <Link
              key={tx._id}
              to={`/credits/${tx._id}`}
              className="block bg-card rounded-xl border p-3 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={tx.liveStatus} />
                    <DueCountdown dueAt={tx.dueAt} status={tx.liveStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(tx.issuedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">GHS {fmt(tx.liveTotal)}</p>
                  {tx.livePenalty > 0 && (
                    <p className="text-xs text-red-600">+GHS {fmt(tx.livePenalty)} penalty</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </TabsContent>
      </Tabs>

      {/* ── Reactivate / Deactivate ───────────────────────────────────── */}
      {driver.isActive ? (
        <Button
          variant="secondary"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => setConfirmDialog("deactivate")}
        >
          <UserX className="w-4 h-4" />
          Deactivate Customer
        </Button>
      ) : (
        <Button
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
          onClick={() => setConfirmDialog("reactivate")}
        >
          <UserCheck className="w-4 h-4" />
          Reactivate Customer
        </Button>
      )}

      {/* ── Confirm Dialog ─────────────────────────────────────────────── */}
      <Dialog open={confirmDialog !== null} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog === "reactivate"
                ? <><UserCheck className="w-4 h-4 text-green-600" /> Reactivate Customer</>
                : <><UserX className="w-4 h-4 text-destructive" /> Deactivate Customer</>
              }
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog === "reactivate"
              ? `Reactivate ${driver.fullName}? They will be able to receive new fuel credits again.`
              : `Deactivate ${driver.fullName}? They will no longer be able to receive new fuel credits.`
            }
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              className={confirmDialog === "reactivate" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={confirmDialog === "deactivate" ? "destructive" : "default"}
              disabled={updating}
              onClick={() => handleToggleActive(confirmDialog === "reactivate")}
            >
              {updating
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Updating...</>
                : confirmDialog === "reactivate" ? "Yes, Reactivate" : "Yes, Deactivate"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Photo lightbox ────────────────────────────────────────────── */}
      {driver.photoUrl && photoPreviewOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoPreviewOpen(false)}
        >
          <button
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
            onClick={() => setPhotoPreviewOpen(false)}
          >
            <XIcon className="w-5 h-5" />
          </button>
          <img
            src={driver.photoUrl}
            alt={driver.fullName}
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-sm font-medium">
            {driver.fullName}
          </p>
        </div>
      )}

      {/* ── Edit Driver Dialog ─────────────────────────────────────── */}
      {isOwner && (
        <EditDriverDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          driver={driver}
        />
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
