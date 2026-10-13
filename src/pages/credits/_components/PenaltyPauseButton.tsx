/**
 * Reusable penalty-pause control.
 * Shown on the Transaction detail page and the Risk Manager page.
 * Only visible to owner and risk_manager roles.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { PauseCircle, PlayCircle, Loader2, CalendarClock } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";

type Props = {
  transactionId: Id<"transactions">;
  penaltyPausedUntil?: string;
  penaltyPauseReason?: string;
  /** Show as a compact row instead of the full card */
  compact?: boolean;
};

// Quick preset buttons
const PRESETS: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

function toLocalDatetimeValue(date: Date) {
  // yyyy-MM-ddTHH:mm required for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function PenaltyPauseButton({
  transactionId,
  penaltyPausedUntil,
  penaltyPauseReason,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pauseUntil, setPauseUntil] = useState(() =>
    toLocalDatetimeValue(addDays(new Date(), 7))
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const setPause = useMutation(api.transactions.setPenaltyPause);
  const clearPause = useMutation(api.transactions.clearPenaltyPause);

  const isPaused =
    !!penaltyPausedUntil && new Date(penaltyPausedUntil) > new Date();

  const handlePause = async () => {
    setLoading(true);
    try {
      await setPause({
        transactionId,
        pauseUntil: new Date(pauseUntil).toISOString(),
        reason: reason.trim() || undefined,
      });
      toast.success("Penalty paused successfully.");
      setOpen(false);
      setReason("");
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to pause penalty.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      await clearPause({ transactionId });
      toast.success("Penalty resumed.");
    } catch {
      toast.error("Failed to resume penalty.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isPaused ? (
        /* ── Currently paused — show badge + resume button ─────────────── */
        <div className={cn(
          "rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700",
          compact ? "flex items-center gap-3 px-3 py-2" : "p-3 space-y-2"
        )}>
          <div className={cn("flex items-center gap-2 flex-wrap", compact ? "flex-1 min-w-0" : "")}>
            <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300">
              Penalty Paused
            </Badge>
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Until {format(new Date(penaltyPausedUntil!), "dd MMM yyyy, h:mm a")}
            </span>
          </div>
          {!compact && penaltyPauseReason && (
            <p className="text-xs text-muted-foreground pl-6">Reason: {penaltyPauseReason}</p>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs gap-1.5 shrink-0"
            disabled={loading}
            onClick={handleResume}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
            Resume
          </Button>
        </div>
      ) : (
        /* ── Not paused — show pause button ────────────────────────────── */
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 shrink-0"
          onClick={() => setOpen(true)}
        >
          <PauseCircle className="w-3.5 h-3.5" />
          Pause Penalty
        </Button>
      )}

      {/* ── Pause dialog ────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" />
              Pause Penalty Accrual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              While paused, no new penalty will accrue on this transaction. The pause
              lifts automatically on the date you choose.
            </p>

            {/* Quick presets */}
            <div>
              <Label className="text-xs mb-1.5 block">Quick preset</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(({ label, days }) => (
                  <button
                    key={days}
                    type="button"
                    className="text-xs rounded-lg border px-3 py-1.5 hover:bg-muted transition-colors font-medium"
                    onClick={() => setPauseUntil(toLocalDatetimeValue(addDays(new Date(), days)))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date picker */}
            <div className="space-y-1.5">
              <Label htmlFor="pause-until">Pause until</Label>
              <Input
                id="pause-until"
                type="datetime-local"
                value={pauseUntil}
                min={toLocalDatetimeValue(new Date())}
                onChange={(e) => setPauseUntil(e.target.value)}
              />
            </div>

            {/* Optional reason */}
            <div className="space-y-1.5">
              <Label htmlFor="pause-reason">Reason (optional)</Label>
              <Textarea
                id="pause-reason"
                placeholder="e.g. Customer awaiting salary, dispute under review..."
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePause} disabled={loading || !pauseUntil} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
