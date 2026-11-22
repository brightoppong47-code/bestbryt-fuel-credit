const DAY = 86400000;
/** Saturday fuel is due Sunday; its first Monday penalty anniversary gets eight extra hours. */
export function saturdayMondayPenaltyStart(dueAt: string, issuedAt?: string): string | null {
  if (!issuedAt) return null;
  const issued = new Date(issuedAt), due = new Date(dueAt);
  if (!Number.isFinite(issued.getTime()) || !Number.isFinite(due.getTime()) || issued.getUTCDay() !== 6 || due.getUTCDay() !== 0 || due.getTime() - issued.getTime() !== DAY) return null;
  return new Date(due.getTime() + DAY + 8 * 3600000).toISOString();
}

/** Completed overdue-day anniversaries, excluding Sundays in Ghana (UTC). */
export function penaltyDays(dueAt: string, now: Date, issuedAt?: string): number {
  const due = new Date(dueAt);
  const elapsed = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
  if (!Number.isFinite(elapsed)) return 0;
  const weeks = Math.floor(elapsed / 7);
  let chargeable = weeks * 6;
  for (let day = 1; day <= elapsed % 7; day++) {
    if ((due.getUTCDay() + day) % 7 !== 0) chargeable++;
  }
  const graceEnd = saturdayMondayPenaltyStart(dueAt, issuedAt);
  if (graceEnd && now.getTime() >= Date.parse(graceEnd) - 8 * 3600000 && now.getTime() < Date.parse(graceEnd)) chargeable--;
  return Math.max(0, chargeable);
}
