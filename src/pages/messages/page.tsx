import { useState } from "react";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import MessagePreparation from "./_components/MessagePreparation";

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
    submissionStatus?: string;
    provider?: string;
    providerId?: string;
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
            <span className="text-xs font-medium">{log.submissionStatus ?? (log.success ? "Legacy accepted" : "Legacy failed")} · {MSG_TYPE_LABELS[log.messageType] ?? log.messageType}</span>
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
          {log.providerId && <p className="mt-1">BMS campaign: {log.providerId}</p>}
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
  const user = useQuery(api.users.getCurrentUserData);
  const logs = useQuery(api.messaging_internal.getRecentLogs, user?.role === "owner" ? {} : "skip");

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

      </div>

      <Tabs defaultValue="prepare" className="gap-4">
        <TabsList aria-label="Messaging sections"><TabsTrigger value="prepare">Prepare messages</TabsTrigger>{user?.role === "owner" && <TabsTrigger value="history">Sent history</TabsTrigger>}</TabsList>
        <TabsContent value="prepare" forceMount className="data-[state=inactive]:hidden"><MessagePreparation /></TabsContent>
        {user?.role === "owner" && <TabsContent value="history">
      {/* Recent logs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Message submissions (not delivery confirmations)
          </CardTitle>
        </CardHeader>
        {logs === undefined ? (
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </CardContent>
        ) : logs.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">No messages sent yet. Draft previews do not appear in sent history.</p>
          </CardContent>
        ) : (
          <div className="divide-y">
            {logs.map((l) => (
              <LogRow key={l._id} log={l as Parameters<typeof LogRow>[0]["log"]} />
            ))}
          </div>
        )}
      </Card>

        </TabsContent>}
      </Tabs>
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
