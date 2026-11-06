import CollectionsReport from "./_components/CollectionsReport.tsx";
import CustomerPurchasesReport from "./_components/CustomerPurchasesReport.tsx";
import ReconciliationReport from "./_components/ReconciliationReport.tsx";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import { Component, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  AlertTriangle, Clock, TrendingUp, Banknote, Fuel,
  ChevronRight, BarChart2, CalendarDays, ClipboardCheck, Building2, FileDown, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ExportButton } from "./_components/ExportButton.tsx";
import { generateBusinessReportPdf } from "./_components/PdfReportGenerator.tsx";
import type { DashboardStats } from "./_components/PdfReportGenerator.tsx";

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DAY_OPTIONS = [7, 14, 30];

function DailySummaryChart({ days }: { days: number }) {
  const summary = useQuery(api.transactions.getDailySummary, { days });
  if (summary === undefined) return <Skeleton className="h-52 w-full" />;
  const hasData = summary.some((d) => d.creditsGhs > 0 || d.paymentsGhs > 0);
  if (!hasData) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
        <BarChart2 className="w-8 h-8 text-muted-foreground/40" />
        <p>No activity in this period</p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={summary} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={10}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(val, name) => [
            `GHS ${fmt(typeof val === "number" ? val : 0)}`,
            name === "creditsGhs" ? "Credits Given" : "Repayments",
          ]}
        />
        <Legend
          formatter={(val) => val === "creditsGhs" ? "Credits Given" : "Repayments"}
          iconSize={10} wrapperStyle={{ fontSize: 11 }}
        />
        <Bar dataKey="creditsGhs" fill="oklch(0.22 0.04 210)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="paymentsGhs" fill="oklch(0.65 0.18 145)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OutstandingList() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<Array<{
    _id: Id<"transactions">;
    driverName: string; driverAccountNumber: string;
    isOverdue: boolean; overdueDays: number;
    remaining: number; penalty: number;
    fuelAmountGhs: number; issuedAt: string;
  }>>([]);
  const result = useQuery(api.transactions.getOutstandingBalances, { paginationOpts: { numItems: 20, cursor } });
  const currentPage = result?.page ?? [];
  const mergedItems = cursor === null
    ? currentPage
    : [...allItems, ...currentPage.filter((p) => !allItems.find((a) => a._id === p._id))];

  if (result === undefined && allItems.length === 0) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }
  if (mergedItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center space-y-2 text-muted-foreground">
        <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">No outstanding balances</p>
        <p className="text-xs">All credits have been paid. Great job!</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {mergedItems.map((tx) => (
        <Link key={tx._id} to={`/credits/${tx._id}`} className="block">
          <Card className={`hover:bg-muted/40 transition-colors ${tx.isOverdue ? "border-destructive/40" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tx.isOverdue ? "bg-destructive/10" : "bg-amber-500/10"}`}>
                  {tx.isOverdue ? <AlertTriangle className="w-5 h-5 text-destructive" /> : <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tx.driverName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{tx.driverAccountNumber}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Fuel className="w-3 h-3" />GHS {fmt(tx.fuelAmountGhs)} fuel</span>
                    {tx.penalty > 0 && (
                      <span className="text-destructive flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />+GHS {fmt(tx.penalty)} penalty</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-base font-bold ${tx.isOverdue ? "text-destructive" : "text-foreground"}`}>GHS {fmt(tx.remaining)}</p>
                  {tx.isOverdue ? (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />{tx.overdueDays}d overdue
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />Pending
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
      {result && !result.isDone && (
        <Button variant="secondary" className="w-full" onClick={() => { setAllItems(mergedItems); setCursor(result.continueCursor); }}>
          Load More
        </Button>
      )}
    </div>
  );
}

// ─── EOD Reports Section ──────────────────────────────────────────────────────

function EodReportsSection() {
  const reports = useQuery(api.eod.listEodReports, { limitDays: 14 });
  const [expanded, setExpanded] = useState<string | null>(null);

  if (reports === undefined) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center space-y-2 text-muted-foreground">
        <ClipboardCheck className="w-7 h-7 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">No EOD reports yet</p>
        <p className="text-xs">Branch secretaries will appear here once they close their day.</p>
      </div>
    );
  }

  // Group by date
  const byDate = reports.reduce<Record<string, typeof reports>>((acc, r) => {
    (acc[r.reportDate] ??= []).push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => {
        const dayReports = byDate[date];
        const totalCredits = dayReports.reduce((s, r) => s + r.creditsIssuedGhs, 0);
        const totalPayments = dayReports.reduce((s, r) => s + r.paymentsReceivedGhs, 0);
        const totalInterest = dayReports.reduce((s, r) => s + r.interestCollectedGhs, 0);
        const totalPenalties = dayReports.reduce((s, r) => s + r.penaltiesCollectedGhs, 0);
        const totalCustomers = dayReports.reduce((s, r) => s + r.customersServed, 0);
        const isOpen = expanded === date;

        return (
          <div key={date} className="rounded-xl border overflow-hidden">
            {/* Date header / summary row */}
            <button
              onClick={() => setExpanded(isOpen ? null : date)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <CalendarDays className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {format(new Date(date + "T12:00:00"), "EEEE, dd MMM yyyy")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dayReports.length} branch{dayReports.length !== 1 ? "es" : ""} · {totalCustomers} customers · GHS {fmt(totalPayments)} received
                </p>
              </div>
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>

            {/* Totals bar */}
            <div className="grid grid-cols-4 gap-0 divide-x border-t text-center">
              {[
                { label: "Credits", value: `GHS ${fmt(totalCredits)}`, color: "" },
                { label: "Payments", value: `GHS ${fmt(totalPayments)}`, color: "text-green-700 dark:text-green-400" },
                { label: "Interest", value: `GHS ${fmt(totalInterest)}`, color: "text-primary" },
                { label: "Penalties", value: `GHS ${fmt(totalPenalties)}`, color: "text-destructive" },
              ].map(({ label, value, color }) => (
                <div key={label} className="py-2 px-2">
                  <p className={`text-xs font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Per-branch breakdown (expandable) */}
            {isOpen && (
              <div className="divide-y border-t">
                {dayReports.map((r) => (
                  <div key={r._id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-mono font-bold text-xs shrink-0">
                        {r.branchCode}
                      </div>
                      <span className="font-semibold text-sm">{r.branchName}</span>
                      <Badge variant="secondary" className="text-xs">{r.submittedByName}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        Closed {format(new Date(r.submittedAt), "h:mm a")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs pl-9">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Customers</span>
                        <span className="font-semibold">{r.customersServed}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Credits</span>
                        <span className="font-semibold">GHS {fmt(r.creditsIssuedGhs)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Payments</span>
                        <span className="font-semibold text-green-700 dark:text-green-400">GHS {fmt(r.paymentsReceivedGhs)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Interest</span>
                        <span className="font-semibold">GHS {fmt(r.interestCollectedGhs)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Penalties</span>
                        <span className="font-semibold">GHS {fmt(r.penaltiesCollectedGhs)}</span>
                      </div>
                    </div>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground italic pl-9">"{r.notes}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Reports Page ────────────────────────────────────────────────────────


class ReportErrorBoundary extends Component<
  { children: ReactNode; title: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    if (this.state.error) {
      return (
        <Card role="alert">
          <CardContent className="p-4 space-y-3">
            <h2 className="font-semibold">{this.props.title} could not load</h2>
            <p className="text-sm text-muted-foreground">
              This section encountered an error. Other report sections and the menu are still available.
            </p>
            <details className="text-sm" open>
              <summary className="cursor-pointer font-medium">Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {this.state.error.message}
              </pre>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>
              <Button variant="secondary" asChild><Link to="/">Back to dashboard</Link></Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function ReportsInner() {
  const user = useQuery(api.users.getCurrentUserData);
  return <div className="p-4 md:p-6 space-y-4 pb-10">
    <div><h1 className="text-xl font-bold">Reports</h1><p className="text-sm text-muted-foreground">Choose a section below to view or print its report.</p></div>
    <Tabs defaultValue="collections" className="gap-4">
      <TabsList aria-label="Report sections" className="grid w-full grid-cols-2 gap-1 !h-auto p-1.5 md:flex md:flex-wrap md:justify-start">
        <TabsTrigger value="collections" className="min-h-12 whitespace-normal text-center md:min-h-10">Collections</TabsTrigger>
        <TabsTrigger value="customers" className="min-h-12 whitespace-normal text-center md:min-h-10">Customer purchases</TabsTrigger>
        {user?.role === "owner" && <TabsTrigger value="reconciliation" className="min-h-12 whitespace-normal text-center md:min-h-10">Reconciliation</TabsTrigger>}
        <TabsTrigger value="eod" className="min-h-12 whitespace-normal text-center md:min-h-10">End-of-day reports</TabsTrigger>
        <TabsTrigger value="outstanding" className="min-h-12 whitespace-normal text-center md:min-h-10">Outstanding balances</TabsTrigger>
      </TabsList>
      <TabsContent value="collections" forceMount className="data-[state=inactive]:hidden"><ReportErrorBoundary title="Collections report"><CollectionsReport /></ReportErrorBoundary></TabsContent>
      <TabsContent value="customers" forceMount className="data-[state=inactive]:hidden"><ReportErrorBoundary title="Customer purchase report"><CustomerPurchasesReport /></ReportErrorBoundary></TabsContent>
      {user?.role === "owner" && <TabsContent value="reconciliation" forceMount className="data-[state=inactive]:hidden"><ReportErrorBoundary title="Reconciliation report"><ReconciliationReport /></ReportErrorBoundary></TabsContent>}
      <TabsContent value="eod" forceMount className="data-[state=inactive]:hidden"><h2 className="text-base font-bold mb-3">Submitted branch end-of-day reports</h2>
        <p className="text-xs text-muted-foreground mb-3">Previously submitted snapshots across branches. Collection filters do not change these historical submissions.</p><ReportErrorBoundary title="End-of-day reports"><EodReportsSection /></ReportErrorBoundary></TabsContent>
      <TabsContent value="outstanding" forceMount className="data-[state=inactive]:hidden"><h2 className="text-base font-bold mb-3">Current outstanding balances</h2>
        <p className="text-xs text-muted-foreground mb-3">Current unpaid balances across accessible branches, independent of the collection date range.</p><ReportErrorBoundary title="Outstanding balances"><OutstandingList /></ReportErrorBoundary></TabsContent>
    </Tabs>
  </div>;
}

export default function ReportsPage() {
  return (
    <Authenticated>
      <ReportsInner />
    </Authenticated>
  );
}
