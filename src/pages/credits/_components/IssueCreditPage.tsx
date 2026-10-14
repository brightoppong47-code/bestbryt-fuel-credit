import { useState, useEffect } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  ArrowLeft, Fuel, Loader2, User, Calculator,
  CheckCircle, TrendingUp, Banknote, CircleDollarSign,
  ShieldX, ArrowRight,
} from "lucide-react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Link } from "react-router-dom";

const schema = z.object({
  fuelAmountGhs: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Enter a valid amount greater than 0"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function IssueCreditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedDriverId = searchParams.get("driverId");

  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string>(preselectedDriverId ?? "");
  const [interestCollected, setInterestCollected] = useState(false);
  // Inline blocking message when arrears rule blocks the credit
  const [arrearsBlock, setArrearsBlock] = useState<string | null>(null);

  const issueCredit = useMutation(api.transactions.issueCredit);
  const appSettings = useQuery(api.appSettings.getAppSettings);
  const interestRatePercent = appSettings?.interestRatePercent ?? 5;
  useEffect(() => { setInterestCollected(false); }, [interestRatePercent]);

  const selectedDriver = useQuery(
    api.drivers.getDriver,
    selectedDriverId ? { driverId: selectedDriverId as Id<"drivers"> } : "skip"
  );

  const { results: searchResults } = usePaginatedDriverSearch(driverSearch);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const amountRaw = watch("fuelAmountGhs");
  const amount = parseFloat(amountRaw) || 0;
  const interest = Math.round(amount * interestRatePercent) / 100;
  const total = Math.round((amount + interest) * 100) / 100;

  const handleAmountChange = () => {
    if (interestCollected) setInterestCollected(false);
  };

  // Clear the arrears block whenever driver changes
  const handleDriverChange = (id: string) => {
    setSelectedDriverId(id);
    setArrearsBlock(null);
    setInterestCollected(false);
  };

  const onSubmit = async (values: FormValues) => {
    if (!selectedDriverId) {
      toast.error("Please select a driver first.");
      return;
    }
    if (!interestCollected) {
      toast.error("Please confirm the interest has been collected before issuing the credit.");
      return;
    }
    setArrearsBlock(null);
    try {
      const txId = await issueCredit({
        driverId: selectedDriverId as Id<"drivers">,
        fuelAmountGhs: parseFloat(values.fuelAmountGhs),
        interestCollectedUpfront: interestCollected,
        expectedInterestRatePercent: interestRatePercent,
        notes: values.notes || undefined,
      });
      toast.success("Fuel credit issued successfully!");
      navigate(`/credits/${txId}`);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { code: string; message: string };
        if (data.code === "FORBIDDEN" && data.message.includes("arrears")) {
          // Show inline block — don't use toast for a rule the user needs to act on
          setArrearsBlock(data.message);
        } else {
          toast.error(data.message);
        }
      } else {
        toast.error("Failed to issue credit.");
      }
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/credits")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Issue Fuel Credit</h1>
          <p className="text-muted-foreground text-sm">Record fuel given on credit to a driver</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Driver selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Select Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDriver ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                    {selectedDriver.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedDriver.fullName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{selectedDriver.accountNumber}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { handleDriverChange(""); }}
                  className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Search by name, phone or account number..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                />
                {driverSearch.length >= 2 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">No drivers found.</p>
                    ) : (
                      searchResults.map((d) => (
                        <button
                          key={d._id}
                          type="button"
                          onClick={() => { handleDriverChange(d._id); setDriverSearch(""); }}
                          className="w-full text-left p-3 hover:bg-muted transition-colors flex items-center gap-3 cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {d.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{d.fullName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{d.accountNumber} · {d.phone}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {driverSearch.length < 2 && (
                  <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Amount */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="w-4 h-4 text-primary" />
              Fuel Amount
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fuelAmountGhs">Amount (GHS) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">GHS</span>
                <Input
                  id="fuelAmountGhs"
                  placeholder="0.00"
                  className="pl-12 text-lg font-semibold"
                  {...register("fuelAmountGhs", { onChange: handleAmountChange })}
                />
              </div>
              {errors.fuelAmountGhs && (
                <p className="text-destructive text-xs">{errors.fuelAmountGhs.message}</p>
              )}
            </div>

            {/* Breakdown */}
            {amount > 0 && (
              <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-xs uppercase tracking-wider mb-2">
                  <Calculator className="w-3.5 h-3.5" />
                  Calculation Breakdown
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fuel Principal</span>
                  <span className="font-medium">GHS {fmt(amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest ({interestRatePercent}%) — collect now</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">GHS {fmt(interest)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Driver pays tomorrow</span>
                  <span className="text-primary">GHS {fmt(interestCollected ? amount : total)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  {interestCollected
                    ? "Interest collected. Driver only owes the principal tomorrow."
                    : "Interest collected upfront. Remaining principal due in 24 hours."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Interest Collection Step ── only shown when amount > 0 */}
        {amount > 0 && (
          interestCollected ? (
            // Confirmed state
            <div className="rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/30 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-green-800 dark:text-green-300 text-sm">Interest Collected</p>
                <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">
                  GHS {fmt(interest)} received from driver
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInterestCollected(false)}
                className="text-xs text-green-700 dark:text-green-400 hover:text-destructive shrink-0 underline underline-offset-2"
              >
                Undo
              </button>
            </div>
          ) : (
            // Pending — prompt to collect interest
            <button
              type="button"
              onClick={() => setInterestCollected(true)}
              className="w-full rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-5 text-left hover:bg-amber-100 dark:hover:bg-amber-950/40 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                  <CircleDollarSign className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-900 dark:text-amber-300 text-base leading-tight">
                    Collect Interest First
                  </p>
                  <p className="text-amber-800 dark:text-amber-400 text-sm mt-0.5">
                    Receive <span className="font-bold">GHS {fmt(interest)}</span> from driver now
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-amber-700 dark:text-amber-500">
                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {interestRatePercent}% of GHS {fmt(amount)}</span>
                    <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> Cash on the spot</span>
                  </div>
                </div>
                <span className="text-amber-500 text-2xl font-bold shrink-0">›</span>
              </div>
              <div className="mt-3 pt-3 border-t border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-500 text-center">
                Tap here to confirm you have collected the interest
              </div>
            </button>
          )
        )}

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="Any remarks about this transaction..." rows={3} {...register("notes")} />
          </CardContent>
        </Card>

        {/* Arrears block — shown when 70% rule blocks the credit */}
        {arrearsBlock && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center shrink-0">
                <ShieldX className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-destructive text-sm">Credit Blocked — Arrears Rule</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{arrearsBlock}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Ask the customer to settle at least 70% of their outstanding balance, then try again.
            </p>
            {selectedDriverId && (
              <Link
                to={`/drivers/${selectedDriverId}`}
                className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
              >
                View customer payments <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        )}

        <Button
          type="submit"
          className="w-full gap-2"
          size="lg"
          disabled={!appSettings || isSubmitting || (amount > 0 && !interestCollected) || !!arrearsBlock}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting
            ? "Issuing..."
            : arrearsBlock
            ? "Credit Blocked"
            : amount > 0 && !interestCollected
            ? "Collect Interest to Continue"
            : `Issue Credit${amount > 0 ? ` — GHS ${fmt(total)}` : ""}`}
        </Button>
      </form>
    </div>
  );
}

function usePaginatedDriverSearch(search: string) {
  const { results } = usePaginatedQuery(
    api.drivers.listDrivers,
    search.length >= 2 ? { search } : "skip",
    { initialNumItems: 8 }
  );
  return { results: results ?? [] };
}
