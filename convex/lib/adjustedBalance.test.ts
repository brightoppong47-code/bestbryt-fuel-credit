import { describe, expect, it } from "vitest";
import { adjustedBalance, type AdjustableCredit } from "./adjustedBalance";

const tx: AdjustableCredit = {
  fuelAmountGhs: 100, interestGhs: 10, interestCollectedUpfront: false,
  totalOwedGhs: 110, dueAt: "2026-11-02T12:00:00.000Z",
  status: "overdue", penaltyGhs: 0, amountPaidGhs: 20,
};
const date = new Date("2026-11-04T12:00:00.000Z");

describe("adjustedBalance", () => {
  it("preserves payments while correcting principal and interest", () => {
    const b = adjustedBalance({...tx, principalAdjustmentGhs: -10, interestAdjustmentGhs: 5}, date);
    expect(b.principal).toBe(90);
    expect(b.interest).toBe(15);
    expect(b.total).toBe(115.5);
    expect(b.remaining).toBe(95.5);
  });
  it("reflects manual penalty reductions and increases", () => {
    expect(adjustedBalance({...tx, penaltyAdjustmentGhs: -5}, date).penalty).toBe(6);
    expect(adjustedBalance({...tx, penaltyAdjustmentGhs: 5}, date).penalty).toBe(16);
  });
  it("waives already accrued days but permits new days", () => {
    const waived = {...tx, penaltyWaivedThrough: "2026-11-03T12:00:00.000Z"};
    expect(adjustedBalance(waived, date).penalty).toBe(5.5);
    expect(adjustedBalance(waived, new Date("2026-11-03T12:00:00.000Z")).penalty).toBe(0);
  });
  it("does not double count settled penalty adjustments", () => {
    const b = adjustedBalance({...tx, status: "paid", penaltyGhs: 7, penaltyAdjustmentGhs: -4, amountPaidGhs: 117}, date);
    expect(b.penalty).toBe(7);
    expect(b.total).toBe(117);
    expect(b.remaining).toBe(0);
  });
  it("flags impossible negative penalties and balances below collected money", () => {
    expect(adjustedBalance({...tx, penaltyAdjustmentGhs: -50}, date).valid).toBe(false);
    expect(adjustedBalance({...tx, amountPaidGhs: 1000}, date).valid).toBe(false);
  });
  it("does not charge interest again when already collected upfront", () => {
    const b = adjustedBalance({...tx, interestCollectedUpfront: true, status: "pending", dueAt: "2026-11-10T12:00:00.000Z"}, date);
    expect(b.total).toBe(100);
  });
});

// Regression guard: a future pause must not add penalties while active.
describe("penalty pause regression", () => {
  it("does not accrue additional penalties during an active pause", () => {
    const paused = { ...tx, penaltyPausedAt: "2026-11-04T12:00:00.000Z", penaltyPausedUntil: "2026-11-10T12:00:00.000Z" };
    const first = adjustedBalance(paused, new Date("2026-11-04T12:00:00.000Z"));
    const later = adjustedBalance(paused, new Date("2026-11-06T12:00:00.000Z"));
    expect(later.penalty).toBe(first.penalty);
  });
});
