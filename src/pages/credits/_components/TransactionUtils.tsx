import { formatDistanceToNow, format, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

type TxStatus = "pending" | "paid" | "overdue";

export function StatusBadge({ status }: { status: TxStatus }) {
  return (
    <Badge
      className={cn(
        "gap-1 font-semibold",
        status === "paid" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200",
        status === "pending" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
        status === "overdue" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200",
      )}
      variant="outline"
    >
      {status === "paid" && <CheckCircle className="w-3 h-3" />}
      {status === "pending" && <Clock className="w-3 h-3" />}
      {status === "overdue" && <AlertTriangle className="w-3 h-3" />}
      {status === "paid" ? "Paid" : status === "pending" ? "Pending" : "Overdue"}
    </Badge>
  );
}

export function DueCountdown({ dueAt, status }: { dueAt: string; status: TxStatus }) {
  if (status === "paid") return null;
  const due = new Date(dueAt);
  const isOverdue = isPast(due);
  return (
    <span className={cn("text-xs font-medium", isOverdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
      {isOverdue
        ? `Overdue by ${formatDistanceToNow(due)}`
        : `Due in ${formatDistanceToNow(due)}`}
    </span>
  );
}

export function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string) {
  return format(new Date(iso), "dd MMM yyyy, h:mm a");
}
