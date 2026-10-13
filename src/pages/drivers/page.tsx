import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Users, Plus, Search, Phone, Car, MapPin, Hash } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce.ts";

export default function DriversPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search] = useDebounce(searchInput, 300);

  const { results, status, loadMore } = usePaginatedQuery(
    api.drivers.listDrivers,
    { search: search || undefined },
    { initialNumItems: 20 }
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Drivers</h1>
          <p className="text-muted-foreground text-sm">Manage registered commercial drivers</p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link to="/drivers/new">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Driver</span>
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone or account number..."
          className="pl-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {/* Loading */}
      {status === "LoadingFirstPage" && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {status !== "LoadingFirstPage" && results.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>No drivers found</EmptyTitle>
            <EmptyDescription>
              {search ? "No drivers match your search." : "Register your first commercial driver to get started."}
            </EmptyDescription>
          </EmptyHeader>
          {!search && (
            <EmptyContent>
              <Button asChild size="sm">
                <Link to="/drivers/new"><Plus className="w-4 h-4 mr-1" />Add Driver</Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {/* Driver list */}
      <div className="space-y-3">
        {results.map((driver) => (
          <Link
            key={driver._id}
            to={`/drivers/${driver._id}`}
            className="block bg-card rounded-xl border p-4 hover:border-primary/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              {/* Avatar placeholder */}
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {driver.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">{driver.fullName}</span>
                  <Badge variant={driver.isActive ? "default" : "secondary"} className="text-xs shrink-0">
                    {driver.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  <span className="text-xs font-mono text-primary flex items-center gap-1">
                    <Hash className="w-3 h-3" /> {driver.accountNumber}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {driver.phone}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Car className="w-3 h-3" /> {driver.vehiclePlate}
                  </span>
                  {driver.gpsAddress && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[200px]">
                      <MapPin className="w-3 h-3 shrink-0" /> {driver.gpsAddress.split(",")[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {status === "CanLoadMore" && (
        <Button variant="secondary" className="w-full" onClick={() => loadMore(20)}>
          Load More
        </Button>
      )}
    </div>
  );
}
