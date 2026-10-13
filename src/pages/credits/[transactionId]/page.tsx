import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  ArrowLeft, Hash, User, Calendar, Clock, AlertTriangle, CheckCircle,
  Fuel, TrendingUp, Banknote, ShieldAlert, CircleDollarSign, History,
  MessageSquare, Send, Loader2, CheckCircle2, XCircle, FileText,
} from "lucide-react";
import { StatusBadge, DueCountdown, fmt, fmtDate } from "../_components/TransactionUtils.tsx";
import {
  generateCreditReceipt,
  generatePaymentReceipt,
} from "../_components/PdfReceiptGenerator.tsx";
import { toast } from "sonner";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { PenaltyPauseButton } from "../_components/PenaltyPauseButton.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge.tsx";

type PaymentMode = "none" | "part" | "full";
type AlertChannel = "sms" | "whatsapp";
type AlertType = "balance_due" | "payment_received" | "overdue_notice";

export default function TransactionDetailPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("none");
  const [partAmount, setPartAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const markPaid = useMutation(api.transactions.markPaid);
  const recordPayment = useMutation(api.transactions.recordPayment);
  const sendAlert = useAction(api.messaging.sendTransactionAlert);

  const [alertChannel, setAlertChannel] = useState<AlertChannel>("sms");
  const [alertSending, setAlertSending] = useState<AlertType | null>(null);
  const [showAlertPanel, setShowAlertPanel] = useState(false);

  const tx = useQuery(
    api.transactions.getTransaction,
    transactionId ? { transactionId: transactionId as Id<"transactions"> } : "skip"
  );

  const payments = useQuery(
    api.transactions.getPayments,
    transactionId ? { transactionId: transactionId as Id<"transactions"> } : "skip"
  );

  const branch = useQuery(
    api.branches.getBranch,
    tx?.driver?.branchId ? { branchId: tx.driver.branchId as Id<"branches"> } : "skip"
  );

  const messageLogs = useQuery(
    api.messaging_internal.getMessageLogs,
    transactionId ? { transactionId: transactionId as Id<"transactions"> } : "skip"
  );

  const currentUser = useQuery(api.users.getCurrentUserData);

  const handleSendAlert = async (msgType: AlertType) => {
    if (!transactionId) return;
    setAlertSending(msgType);
    try {
      const result = await sendAlert({
        transactionId: transactionId as Id<"transactions">,
        channel: alertChannel,
        messageType: msgType,
      });
      if (result.success) {
        toast.success(`${alertChannel === "sms" ? "SMS" : "WhatsApp"} sent successfully!`);
      } else {
        toast.error(`Send failed: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      toast.error(err instanceof ConvexError ? (err.data as { message: string }).message : "Failed to send.");
    } finally {
      setAlertSending(null);
    }
  };

  const handlePartPayment = async () => {
    if (!transactionId) return;
    const amount = parseFloat(partAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount greater than 0.");
      return;
    }
    if (tx && amount > tx.remainingGhs) {
      toast.error(`Amount cannot exceed the remaining balance of GHS ${fmt(tx.remainingGhs)}.`);
      return;
    }
    setLoading(true);
    try {
      const result = await recordPayment({
        transactionId: transactionId as Id<"transactions">,
        amountGhs: amount,
      });
      if (result.isFullyPaid) {
        toast.success("Full payment received! Transaction closed.");
      } else {
        toast.success(`Payment of GHS ${fmt(amount)} recorded. Remaining: GHS ${fmt(result.remaining)}`);
      }
      setPartAmount("");
      setPaymentMode("none");
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to record payment.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCreditReceipt = () => {
    if (!tx?.driver) return;
    try {
      generateCreditReceipt({
        receiptNumber: tx._id.slice(-8).toUpperCase(),
        issuedAt: tx.issuedAt,
        dueAt: tx.dueAt,
        driverName: tx.driver.fullName,
        accountNumber: tx.driver.accountNumber,
        driverPhone: tx.driver.phone,
        branchName: branch?.name ?? "BESTBRYT VENTURES",
        vehicleType: tx.driver.vehicleType,
        vehiclePlate: tx.driver.vehiclePlate,
        fuelAmountGhs: tx.fuelAmountGhs,
        interestGhs: tx.interestGhs,
        interestCollectedUpfront: tx.interestCollectedUpfront ?? false,
        totalOwedGhs: tx.totalOwedGhs,
        issuedByName: "BESTBRYT VENTURES Staff",
        notes: tx.notes,
      });
      toast.success("Credit receipt downloaded.");
    } catch {
      toast.error("Failed to generate receipt.");
    }
  };

  const handleGeneratePaymentReceipt = () => {
    if (!tx?.driver || !payments || payments.length === 0) {
      toast.error("No payments recorded yet.");
      return;
    }
    try {
      const lastPayment = payments[payments.length - 1];
      generatePaymentReceipt({
        receiptNumber: `PMT-${lastPayment._id.slice(-8).toUpperCase()}`,
        paymentDate: lastPayment.recordedAt,
        driverName: tx.driver.fullName,
        accountNumber: tx.driver.accountNumber,
        driverPhone: tx.driver.phone,
        branchName: branch?.name ?? "BESTBRYT VENTURES",
        fuelAmountGhs: tx.fuelAmountGhs,
        interestGhs: tx.interestGhs,
        totalOwedGhs: tx.totalOwedGhs,
        penaltyGhs: tx.livePenalty,
        liveTotal: tx.liveTotal,
        amountPaidThisTime: lastPayment.amountGhs,
        previouslyPaid: Math.max(0, tx.amountPaidGhs - lastPayment.amountGhs),
        remainingGhs: tx.remainingGhs,
        isFullyPaid: tx.liveStatus === "paid",
        payments: payments.map((p) => ({ date: p.recordedAt, amount: p.amountGhs, note: p.note ?? undefined })),
        recordedByName: lastPayment.recordedByName ?? "BESTBRYT VENTURES Staff",
        notes: tx.notes,
      });
      toast.success("Payment receipt downloaded.");
    } catch {
      toast.error("Failed to generate receipt.");
    }
  };

  const handleMarkFullyPaid = async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      await markPaid({ transactionId: transactionId as Id<"transactions"> });
      toast.success("Payment confirmed! Transaction marked as paid.");
      setPaymentMode("none");
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message: string };
        toast.error(data.message);
      } else {
        toast.error("Failed to mark as paid.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (tx === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Transaction not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/credits")}>Back</Button>
      </div>
    );
  }

  const isPaid = tx.liveStatus === "paid";
  const isOverdue = tx.liveStatus === "overdue";
  const hasPartialPayments = tx.amountPaidGhs > 0 && !isPaid;
  const partAmountNum = parseFloat(partAmount) || 0;
  // Only owner and risk_manager can pause/resume penalties
  const canManagePenalty =
    currentUser?.role === "owner" || currentUser?.role === "risk_manager";

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/credits")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Transaction Detail</h1>
          <p className="text-muted-foreground text-sm">{fmtDate(tx.issuedAt)}</p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl p-4 flex items-center gap-4 ${
        isPaid ? "bg-green-600" : isOverdue ? "bg-red-600" : "bg-primary"
      }`}>
        <div className="text-white/70">
          {isPaid ? <CheckCircle className="w-7 h-7" /> : isOverdue ? <AlertTriangle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider">
            {isPaid ? "Paid" : "Remaining Balance"}
          </p>
          <p className="text-white font-bold text-2xl">GHS {fmt(isPaid ? tx.liveTotal : tx.remainingGhs)}</p>
          {!isPaid && hasPartialPayments && (
            <p className="text-white/70 text-xs">GHS {fmt(tx.amountPaidGhs)} paid so far</p>
          )}
          {!isPaid && <DueCountdown dueAt={tx.dueAt} status={tx.liveStatus} />}
          {isPaid && tx.paidAt && <p className="text-white/70 text-xs">Paid on {fmtDate(tx.paidAt)}</p>}
        </div>
        <StatusBadge status={tx.liveStatus} />
      </div>

      {/* Driver */}
      {tx.driver && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Driver
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to={`/drivers/${tx.driver._id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                {tx.driver.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{tx.driver.fullName}</p>
                <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Hash className="w-3 h-3" />{tx.driver.accountNumber}
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="w-4 h-4 text-primary" />
            Credit Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row icon={<Fuel className="w-4 h-4" />} label="Fuel Principal" value={`GHS ${fmt(tx.fuelAmountGhs)}`} />
          <Row
            icon={<TrendingUp className="w-4 h-4" />}
            label={tx.interestCollectedUpfront ? "Interest (5%) — collected upfront" : "Interest (5%)"}
            value={`GHS ${fmt(tx.interestGhs)}`}
            className={tx.interestCollectedUpfront ? "line-through text-muted-foreground" : "text-amber-600 dark:text-amber-400"}
          />
          {tx.interestCollectedUpfront && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              Interest was collected from the driver at time of issuing
            </div>
          )}
          <Separator />
          <Row icon={<Banknote className="w-4 h-4" />} label="Amount Due" value={`GHS ${fmt(tx.totalOwedGhs)}`} bold />

          {tx.livePenalty > 0 && (
            <>
              <Row
                icon={<ShieldAlert className="w-4 h-4" />}
                label={`Penalty (${tx.overdueDays} day${tx.overdueDays !== 1 ? "s" : ""} × 5%)`}
                value={`+ GHS ${fmt(tx.livePenalty)}`}
                className="text-red-600 dark:text-red-400"
              />
              <Separator />
              <Row icon={<Banknote className="w-4 h-4" />} label="Grand Total (incl. penalty)" value={`GHS ${fmt(tx.liveTotal)}`} bold className="text-red-600 dark:text-red-400" />
              {canManagePenalty && (
                <div className="pt-1">
                  <PenaltyPauseButton
                    transactionId={transactionId as Id<"transactions">}
                    penaltyPausedUntil={tx.penaltyPausedUntil}
                    penaltyPauseReason={tx.penaltyPauseReason}
                  />
                </div>
              )}
            </>
          )}

          {/* Show pause status even when no live penalty (pause set before it became overdue) */}
          {tx.livePenalty === 0 && tx.penaltyPausedUntil && canManagePenalty && (
            <div className="pt-1">
              <PenaltyPauseButton
                transactionId={transactionId as Id<"transactions">}
                penaltyPausedUntil={tx.penaltyPausedUntil}
                penaltyPauseReason={tx.penaltyPauseReason}
              />
            </div>
          )}

          {hasPartialPayments && (
            <>
              <Separator />
              <Row icon={<CircleDollarSign className="w-4 h-4" />} label="Already Paid" value={`− GHS ${fmt(tx.amountPaidGhs)}`} className="text-green-600 dark:text-green-400" />
              <Row icon={<Banknote className="w-4 h-4" />} label="Remaining Balance" value={`GHS ${fmt(tx.remainingGhs)}`} bold className="text-primary" />
            </>
          )}

          <div className="pt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2"><Calendar className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>Issued: {fmtDate(tx.issuedAt)}</span></div>
            <div className="flex gap-2"><Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>Due: {fmtDate(tx.dueAt)}</span></div>
          </div>

          {tx.notes && <p className="text-sm text-muted-foreground border-t pt-3">{tx.notes}</p>}
        </CardContent>
      </Card>

      {/* Payment history */}
      {payments && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {payments.map((p, i) => (
              <div key={p._id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0">
                    <span className="text-green-700 dark:text-green-400 text-xs font-bold">{i + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{fmtDate(p.recordedAt)}</p>
                    {p.note && <p className="text-xs text-muted-foreground truncate">{p.note}</p>}
                  </div>
                </div>
                <span className="font-semibold text-green-600 dark:text-green-400 shrink-0">
                  + GHS {fmt(p.amountGhs)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-1">
              <span>Total Paid</span>
              <span className="text-green-600 dark:text-green-400">GHS {fmt(payments.reduce((s, p) => s + p.amountGhs, 0))}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PDF Receipts ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Download Receipts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            onClick={handleGenerateCreditReceipt}
            className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Fuel className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Credit Issuance Receipt</p>
              <p className="text-xs text-muted-foreground">Shows fuel amount, interest, and total owed</p>
            </div>
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>

          <button
            onClick={handleGeneratePaymentReceipt}
            disabled={!payments || payments.length === 0}
            className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Payment Receipt</p>
              <p className="text-xs text-muted-foreground">
                {payments && payments.length > 0
                  ? `Covers ${payments.length} payment${payments.length !== 1 ? "s" : ""} · GHS ${fmt(payments.reduce((s, p) => s + p.amountGhs, 0))} total`
                  : "No payments recorded yet"}
              </p>
            </div>
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </CardContent>
      </Card>

      {/* ── Notify Driver ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Notify Driver
            </CardTitle>
            <button
              onClick={() => setShowAlertPanel(!showAlertPanel)}
              className="text-xs text-primary font-medium hover:underline"
            >
              {showAlertPanel ? "Hide" : "Send Alert"}
            </button>
          </div>
        </CardHeader>
        {showAlertPanel && (
          <CardContent className="space-y-4">
            {/* Channel toggle */}
            <div>
              <Label className="text-xs mb-1.5 block">Channel</Label>
              <div className="flex rounded-lg overflow-hidden border">
                {(["sms", "whatsapp"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setAlertChannel(c)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      alertChannel === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {c === "sms" ? "📱 SMS" : "💬 WhatsApp"}
                  </button>
                ))}
              </div>
              {tx.driver && (
                <p className="text-xs text-muted-foreground mt-1">
                  Will be sent to: <span className="font-mono font-medium">{tx.driver.phone}</span>
                </p>
              )}
            </div>

            {/* Alert type buttons */}
            <div className="space-y-2">
              <Label className="text-xs">Message Type</Label>
              {[
                {
                  type: "balance_due" as AlertType,
                  label: "Balance Due Reminder",
                  desc: "Reminds driver their payment is due",
                  color: "border-primary/30 hover:bg-primary/5",
                  icon: <Clock className="w-4 h-4 text-primary" />,
                },
                {
                  type: "payment_received" as AlertType,
                  label: "Payment Received",
                  desc: "Confirms we received their payment",
                  color: "border-green-500/30 hover:bg-green-500/5",
                  icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
                },
                {
                  type: "overdue_notice" as AlertType,
                  label: "Overdue Notice",
                  desc: "Urgent notice that account is overdue",
                  color: "border-destructive/30 hover:bg-destructive/5",
                  icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
                },
              ].map(({ type, label, desc, color, icon }) => (
                <button
                  key={type}
                  onClick={() => handleSendAlert(type)}
                  disabled={!!alertSending}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${color}`}
                >
                  <span className="shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  {alertSending === type
                    ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    : <Send className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
              ))}
            </div>
          </CardContent>
        )}

        {/* Last sent log */}
        {messageLogs && messageLogs.length > 0 && (
          <div className="border-t px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1.5">Last sent:</p>
            {messageLogs.slice(0, 3).map((log) => (
              <div key={log._id} className="flex items-center gap-2 py-1 text-xs">
                <span>{log.channel === "sms" ? "📱" : "💬"}</span>
                <span className="font-medium">{
                  log.messageType === "balance_due" ? "Balance Due" :
                  log.messageType === "payment_received" ? "Payment Rcvd" :
                  log.messageType === "overdue_notice" ? "Overdue Notice" : "Broadcast"
                }</span>
                <span className="text-muted-foreground">{format(new Date(log.sentAt), "dd MMM, h:mm a")}</span>
                {log.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Payment Actions ── */}
      {!isPaid && paymentMode === "none" && (
        <div className="grid grid-cols-2 gap-3">
          {/* Part payment */}
          <button
            type="button"
            onClick={() => setPaymentMode("part")}
            className="rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-4 text-left hover:bg-primary/10 active:scale-[0.98] transition-all"
          >
            <CircleDollarSign className="w-6 h-6 text-primary mb-2" />
            <p className="font-bold text-sm leading-tight">Part Payment</p>
            <p className="text-xs text-muted-foreground mt-0.5">Enter custom amount</p>
          </button>

          {/* Full payment */}
          <button
            type="button"
            onClick={() => setPaymentMode("full")}
            className="rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/30 p-4 text-left hover:bg-green-100 dark:hover:bg-green-950/50 active:scale-[0.98] transition-all"
          >
            <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
            <p className="font-bold text-sm leading-tight text-green-800 dark:text-green-300">Full Payment</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">GHS {fmt(tx.remainingGhs)}</p>
          </button>
        </div>
      )}

      {/* Part payment input card */}
      {!isPaid && paymentMode === "part" && (
        <Card className="border-2 border-primary/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-primary" />
              Record Part Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Due</span>
                <span className="font-medium">GHS {fmt(tx.liveTotal)}</span>
              </div>
              {tx.amountPaidGhs > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="font-medium text-green-600">GHS {fmt(tx.amountPaidGhs)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Remaining</span>
                <span className="text-primary">GHS {fmt(tx.remainingGhs)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Amount Received (GHS)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">GHS</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="pl-12 text-lg font-semibold"
                  value={partAmount}
                  onChange={(e) => setPartAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  max={tx.remainingGhs}
                />
              </div>
              {partAmountNum > 0 && partAmountNum <= tx.remainingGhs && (
                <p className="text-xs text-muted-foreground">
                  After this: <span className="font-medium">GHS {fmt(Math.max(0, tx.remainingGhs - partAmountNum))}</span> remaining
                  {partAmountNum >= tx.remainingGhs && " — will be fully closed"}
                </p>
              )}
              {partAmountNum > tx.remainingGhs && (
                <p className="text-xs text-destructive">Cannot exceed remaining balance of GHS {fmt(tx.remainingGhs)}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => { setPaymentMode("none"); setPartAmount(""); }} disabled={loading}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handlePartPayment}
                disabled={loading || !partAmountNum || partAmountNum <= 0 || partAmountNum > tx.remainingGhs}
              >
                {loading
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</span>
                  : `Record GHS ${partAmountNum > 0 ? fmt(partAmountNum) : "0.00"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full payment confirmation card */}
      {!isPaid && paymentMode === "full" && (
        <Card className="border-2 border-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              Confirm Full Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              {tx.amountPaidGhs > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="font-medium text-green-600">GHS {fmt(tx.amountPaidGhs)}</span>
                </div>
              )}
              {!tx.interestCollectedUpfront && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Interest (5%)</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">GHS {fmt(tx.interestGhs)}</span>
                </div>
              )}
              {tx.livePenalty > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Penalty</span>
                  <span className="font-medium text-red-600 dark:text-red-400">GHS {fmt(tx.livePenalty)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Collecting Now</span>
                <span className="text-green-700 dark:text-green-400">GHS {fmt(tx.remainingGhs)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPaymentMode("none")} disabled={loading}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={handleMarkFullyPaid} disabled={loading}>
                {loading
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</span>
                  : <><CheckCircle className="w-4 h-4" />Confirm Paid</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPaid && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            This transaction has been fully paid.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  icon, label, value, bold, className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <span className={`font-${bold ? "bold" : "medium"} ${className ?? ""}`}>{value}</span>
    </div>
  );
}
