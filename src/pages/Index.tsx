import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Fuel, Users, AlertTriangle, TrendingUp, ChevronRight,
  Clock, Banknote,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DashboardInner() {
  const currentUser = useQuery(api.users.getCurrentUserData);
  const stats = useQuery(api.transactions.getDashboardStats, {});
  const outstanding = useQuery(api.transactions.getOutstandingBalances, {
    paginationOpts: { numItems: 5, cursor: null },
  });

  const loading = currentUser === undefined || stats === undefined || outstanding === undefined;

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Outstanding",
      icon: TrendingUp,
      value: `GHS ${fmt(stats.totalOutstandingGhs)}`,
      sub: `${stats.pendingCount} open credit${stats.pendingCount !== 1 ? "s" : ""}`,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Active Drivers",
      icon: Users,
      value: String(stats.activeDrivers),
      sub: "Registered drivers",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Overdue Credits",
      icon: AlertTriangle,
      value: String(stats.overdueCount),
      sub: stats.overdueCount > 0 ? "Needs attention" : "All on time",
      color: stats.overdueCount > 0 ? "text-destructive" : "text-green-600 dark:text-green-400",
      bg: stats.overdueCount > 0 ? "bg-destructive/10" : "bg-green-500/10",
    },
    {
      label: "Credits Today",
      icon: Fuel,
      value: stats.creditsTodayCount > 0 ? `GHS ${fmt(stats.creditsTodayGhs)}` : "—",
      sub: stats.creditsTodayCount > 0 ? `${stats.creditsTodayCount} issued today` : "None issued yet",
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            Good day, {currentUser?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">BESTBRYT VENTURES — Fuel Credit Management</p>
        </div>
        <Link to="/credits/new">
          <Button size="sm" className="gap-1.5 shrink-0">
            <Fuel className="w-4 h-4" />
            Issue Credit
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(({ label, icon: Icon, value, sub, color, bg }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className={`text-lg md:text-xl font-bold leading-tight ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Outstanding balances */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary" />
              Outstanding Balances
            </CardTitle>
            <Link to="/reports" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {outstanding.page.length === 0 ? (
            <div className="px-4 pb-5 text-center text-sm text-muted-foreground py-8 space-y-2">
              <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p>No outstanding balances. All clear!</p>
              <Link to="/credits/new">
                <Button size="sm" variant="secondary" className="mt-2 gap-1.5">
                  <Fuel className="w-3.5 h-3.5" /> Issue First Credit
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {outstanding.page.map((tx) => (
                <Link
                  key={tx._id}
                  to={`/credits/${tx._id as Id<"transactions">}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${tx.isOverdue ? "bg-destructive" : "bg-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.driverName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{tx.driverAccountNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${tx.isOverdue ? "text-destructive" : "text-foreground"}`}>
                      GHS {fmt(tx.remaining)}
                    </p>
                    {tx.isOverdue ? (
                      <p className="text-xs text-destructive flex items-center gap-0.5 justify-end">
                        <AlertTriangle className="w-3 h-3" />
                        {tx.overdueDays}d overdue
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-0.5 justify-end">
                        <Clock className="w-3 h-3" />
                        Pending
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
              {!outstanding.isDone && (
                <div className="px-4 py-3 text-center">
                  <Link to="/reports" className="text-xs text-primary hover:underline">
                    + more outstanding — view full list in Reports
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/drivers/new">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Register Driver</p>
                <p className="text-xs text-muted-foreground">Add new customer</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link to="/reports">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">View Reports</p>
                <p className="text-xs text-muted-foreground">Daily summary</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

export default function Index() {
  return (
    <>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">BESTBRYT VENTURES</h1>
            <p className="text-muted-foreground">Sign in to access the fuel credit dashboard</p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <Authenticated>
        <DashboardInner />
      </Authenticated>
    </>
  );
}
