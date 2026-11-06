import { penaltyDays } from "./penaltyDays";

export type AdjustableCredit = {
  fuelAmountGhs: number;
  interestGhs: number;
  interestCollectedUpfront?: boolean;
  totalOwedGhs: number;
  dueAt: string;
  status: "pending" | "overdue" | "paid";
  penaltyGhs: number;
  principalAdjustmentGhs?: number;
  interestAdjustmentGhs?: number;
  penaltyAdjustmentGhs?: number;
  penaltyWaivedThrough?: string;
  amountPaidGhs?: number;
  penaltyPausedAt?: string;
  penaltyPausedUntil?: string;
};

const money = (n: number) => Math.round(n * 100) / 100;

/** Shared pure calculator. Penalty waivers through a date suppress only the
 * chargeable days already accrued by that date; later days can still accrue.
 * No historical payment row is changed by this calculation.
 */
export function adjustedBalance(tx: AdjustableCredit, now: Date, penaltyRate = 0.05) {
  const principal = money(tx.fuelAmountGhs + (tx.principalAdjustmentGhs ?? 0));
  const interest = money(tx.interestGhs + (tx.interestAdjustmentGhs ?? 0));
  const base = money(principal + (tx.interestCollectedUpfront ? 0 : interest));
  const chargeableDays = penaltyDays(tx.dueAt, now);
  const waivedDays = tx.penaltyWaivedThrough
    ? Math.min(chargeableDays, penaltyDays(tx.dueAt, new Date(tx.penaltyWaivedThrough)))
    : 0;
  const pauseStart = tx.penaltyPausedAt ? new Date(tx.penaltyPausedAt) : undefined;
  const pauseEnd = tx.penaltyPausedUntil ? new Date(tx.penaltyPausedUntil) : undefined;
  const pauseValid = pauseStart && pauseEnd && Number.isFinite(pauseStart.getTime()) && Number.isFinite(pauseEnd.getTime()) && pauseEnd > pauseStart;
  const pausedThrough = pauseValid ? new Date(Math.min(now.getTime(), pauseEnd!.getTime())) : undefined;
  // Waivers cover the earliest chargeable days. Exclude only paused days
  // beyond that boundary so overlapping waivers are not deducted twice.
  const pauseStartDay = pauseStart ? penaltyDays(tx.dueAt, pauseStart) : 0;
  const pauseEndDay = pausedThrough ? penaltyDays(tx.dueAt, pausedThrough) : 0;
  const pausedDays = pauseValid
    ? Math.max(0, pauseEndDay - Math.max(pauseStartDay, waivedDays))
    : 0;
  // Old records have an end date but no start date. We cannot reconstruct
  // their paused days reliably. Freeze the recorded penalty until reviewed.
  const legacyPause = !!tx.penaltyPausedUntil && !tx.penaltyPausedAt;
  const automaticPenalty = tx.status === "paid" || legacyPause
    ? tx.penaltyGhs
    : money(base * penaltyRate * Math.max(0, chargeableDays - waivedDays - pausedDays));
  // A paid transaction stores the final settled penalty, including adjustments.
  const penalty = tx.status === "paid"
    ? money(tx.penaltyGhs)
    : money(automaticPenalty + (tx.penaltyAdjustmentGhs ?? 0));
  const total = money(base + penalty);
  const paid = money(tx.amountPaidGhs ?? 0);
  return {
    principal, interest, base, automaticPenalty, penalty,
    total, paid, remaining: money(Math.max(0, total - paid)),
    valid: [principal, interest, penalty, total, paid].every(Number.isFinite)
      && principal >= 0 && interest >= 0 && penalty >= 0 && total >= paid,
  };
}
