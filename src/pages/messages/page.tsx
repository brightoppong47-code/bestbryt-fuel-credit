import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Authenticated } from "convex/react";
import {
  MessageSquare, Send, Loader2, CheckCircle2, XCircle,
  SmartphoneIcon, Users, Building2, Clock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { format } from "date-fns";

// ─── Channel pill ─────────────────────────────────────────────────────────────

function ChannelToggle({
  value, onChange,
}: {
  value: "sms" | "whatsapp";
  onChange: (v: "sms" | "whatsapp") => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border">
      {(["sms", "whatsapp"] as const).map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            value === c
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {c === "sms" ? "📱 SMS" : "💬 WhatsApp"}
        </button>
      ))}
    </div>
  );
}

// ─── Broadcast compose dialog ─────────────────────────────────────────────────

function BroadcastDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const branches = useQuery(api.branches.listBranches);
  const sendBroadcast = useAction(api.messaging.sendBroadcast);
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [message, setMessage] = useState("");
  const [branchId, setBranchId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null);

  const reset = () => { setMessage(""); setResult(null); };

  const handleSend = async () => {
    if (!message.trim()) { toast.error("Enter a message first."); return; }
    setLoading(true);
    try {
      const res = await sendBroadcast({
        message: message.trim(),
        channel,
        branchId: branchId !== "all" ? branchId as Id<"branches"> : undefined,
      });
      setResult(res);
      if (res.sent > 0) toast.success(`Sent to ${res.sent} driver${res.sent !== 1 ? "s" : ""}!`);
      if (res.failed > 0) toast.error(`${res.failed} message${res.failed !== 1 ? "s" : ""} failed.`);
    } catch (err) {
      toast.error(err instanceof ConvexError ? (err.data as { message: string }).message : "Failed to send.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Broadcast Message
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-bold">{result.sent} message{result.sent !== 1 ? "s" : ""} sent</p>
                  {result.failed > 0 && <p className="text-sm text-destructive">{result.failed} failed</p>}
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => { reset(); }}>Send Another</Button>
              <Button variant="secondary" onClick={() => { onClose(); reset(); }}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <ChannelToggle value={channel} onChange={setChannel} />
            </div>

            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2"><Users className="w-4 h-4" />All Active Drivers</span>
                  </SelectItem>
                  {branches?.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      <span className="flex items-center gap-2"><Building2 className="w-4 h-4" />{b.name} drivers</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                rows={4}
                placeholder="Type your message here... e.g. Reminder: Please ensure all outstanding fuel credits are settled by end of month."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                "BESTBRYT VENTURES" will be prepended automatically. {message.length} / 320 chars.
              </p>
            </div>

            {/* Preview */}
            {message.trim() && (
              <div className="rounded-lg bg-muted/60 border p-3">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Message preview:</p>
                <p className="text-sm whitespace-pre-wrap">{`BESTBRYT VENTURES\n${message.trim()}`}</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => { onClose(); reset(); }}>Cancel</Button>
              <Button onClick={handleSend} disabled={loading || !message.trim()} className="gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                Send Now
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Message log row ──────────────────────────────────────────────────────────

const MSG_TYPE_LABELS: Record<string, string> = {
  balance_due: "Balance Due",
  payment_received: "Payment Received",
  overdue_notice: "Overdue Notice",
  broadcast: "Broadcast",
};

function LogRow({ log }: {
  log: {
    _id: string;
    channel: "sms" | "whatsapp";
    messageType: string;
    phone: string;
    success: boolean;
    error?: string;
    sentAt: string;
    body: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          log.success ? "bg-green-100 dark:bg-green-950" : "bg-destructive/10"
        }`}>
          {log.success
            ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            : <XCircle className="w-4 h-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">{log.channel === "sms" ? "📱 SMS" : "💬 WhatsApp"}</Badge>
            <span className="text-xs font-medium">{MSG_TYPE_LABELS[log.messageType] ?? log.messageType}</span>
            <span className="text-xs text-muted-foreground font-mono">{log.phone}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(log.sentAt), "dd MMM yyyy, h:mm a")}
          </p>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 ml-10 text-xs bg-muted rounded-lg p-2.5 whitespace-pre-wrap">
          {log.body}
          {!log.success && log.error && (
            <p className="mt-1 text-destructive">Error: {log.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function MessagesInner() {
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const logs = useQuery(api.messaging_internal.getRecentLogs, {});

  return (
    <div className="p-4 md:p-6 space-y-5 pb-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Messages
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">SMS & WhatsApp alerts to drivers</p>
        </div>
        <Button onClick={() => setBroadcastOpen(true)} className="gap-2 shrink-0">
          <Send className="w-4 h-4" />
          Broadcast
        </Button>
      </div>

      {/* Setup reminder if no logs */}
      {logs && logs.length === 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Twilio secrets needed</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  To send messages, add the following 4 secrets in <strong>Settings → Secrets</strong>:
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc ml-4 space-y-0.5">
                  <li><code className="font-mono">TWILIO_ACCOUNT_SID</code></li>
                  <li><code className="font-mono">TWILIO_AUTH_TOKEN</code></li>
                  <li><code className="font-mono">TWILIO_SMS_FROM</code> — your Twilio number e.g. <code>+12345678901</code></li>
                  <li><code className="font-mono">TWILIO_WHATSAPP_FROM</code> — your WhatsApp-enabled number e.g. <code>+14155238886</code></li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent logs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Recent Messages
          </CardTitle>
        </CardHeader>
        {logs === undefined ? (
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </CardContent>
        ) : logs.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">No messages sent yet. Use the Broadcast button or send from a transaction.</p>
          </CardContent>
        ) : (
          <div className="divide-y">
            {logs.map((l) => (
              <LogRow key={l._id} log={l as Parameters<typeof LogRow>[0]["log"]} />
            ))}
          </div>
        )}
      </Card>

      <BroadcastDialog open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Authenticated>
      <MessagesInner />
    </Authenticated>
  );
}
