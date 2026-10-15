import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Fuel, Plus, Hash, Phone } from "lucide-react";
import { StatusBadge, DueCountdown, fmt, fmtDate } from "./_components/TransactionUtils.tsx";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs.tsx";

type FilterStatus = "all" | "pending" | "overdue" | "paid";

function TransactionList({ status, branchId }: { status: FilterStatus; branchId?: Id<"branches"> }) {
  const { results, loadMore, status: qStatus } = usePaginatedQuery(
    api.transactions.listTransactions,
    { branchId, status: status === "all" ? undefined : status },
    { initialNumItems: 20 }
  );

  if (qStatus === "LoadingFirstPage") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Fuel /></EmptyMedia>
          <EmptyTitle>No {status === "all" ? "" : status} credits</EmptyTitle>
          <EmptyDescription>
            {branchId ? "No credits match this branch and status." : status === "all" ? "Issue your first fuel credit to get started." : `No ${status} transactions.`}
          </EmptyDescription>
        </EmptyHeader>
        {status === "all" && (
          <EmptyContent>
            <Button asChild size="sm"><Link to="/credits/new"><Plus className="w-4 h-4 mr-1" />Issue Credit</Link></Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {results.map((tx) => (
        <Link
          key={tx._id}
          to={`/credits/${tx._id}`}
          className="block bg-card rounded-xl border p-4 hover:border-primary/50 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{tx.driverName}</span>
                <StatusBadge status={tx.liveStatus} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Hash className="w-3 h-3" />{tx.driverAccountNumber}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />{tx.driverPhone}
                </span>
              </div>
              <DueCountdown dueAt={tx.dueAt} status={tx.liveStatus} />
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-lg text-primary">GHS {fmt(tx.liveTotal)}</p>
              {tx.livePenalty > 0 && (
                <p className="text-xs text-red-600 dark:text-red-400">+GHS {fmt(tx.livePenalty)} penalty</p>
              )}
              <p className="text-xs text-muted-foreground">{fmtDate(tx.issuedAt)}</p>
            </div>
          </div>
        </Link>
      ))}
      {qStatus === "CanLoadMore" && (
        <Button variant="secondary" className="w-full" onClick={() => loadMore(20)}>Load More</Button>
      )}
    </div>
  );
}

export default function CreditsPage() {
  const user = useQuery(api.users.getCurrentUserData);
  const branches = useQuery(api.branches.listBranches);
  const settings = useQuery(api.appSettings.getAppSettings);
  const [branchId, setBranchId] = useState<Id<"branches"> | undefined>();
  const [tab, setTab] = useState<FilterStatus>("all");

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Fuel Credits</h1>
          <p className="text-muted-foreground text-sm">All fuel issued on credit</p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link to="/credits/new"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Issue Credit</span></Link>
        </Button>
      </div>

      {user?.role === "owner" && <div className="space-y-2 max-w-sm">
        <label htmlFor="branch-filter" className="text-sm font-medium">Branch</label>
        <select disabled={!settings?.branchFilteringEnabled} id="branch-filter" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={branchId ?? ""} onChange={e => setBranchId((e.target.value || undefined) as Id<"branches"> | undefined)}>
          <option value="">All branches</option>
          {branches?.slice().sort((a,b) => a.name.localeCompare(b.name)).map(branch => <option key={branch._id} value={branch._id}>{branch.name}{branch.isActive ? "" : " (inactive)"}</option>)}
        </select>
        {settings && !settings.branchFilteringEnabled && <p className="text-xs text-muted-foreground">Branch filtering will be available after the backend update is deployed.</p>}
      </div>}

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterStatus)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <TransactionList key={`${tab}-${branchId ?? "all"}`} status={tab} branchId={branchId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
