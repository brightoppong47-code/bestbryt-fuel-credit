/** Completed overdue-day anniversaries, excluding Sundays in Ghana (UTC). */
export function penaltyDays(dueAt: string, now: Date): number {
  const due = new Date(dueAt);
  const elapsed = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
  if (!Number.isFinite(elapsed)) return 0;
  const weeks = Math.floor(elapsed / 7);
  let chargeable = weeks * 6;
  for (let day = 1; day <= elapsed % 7; day++) {
    if ((due.getUTCDay() + day) % 7 !== 0) chargeable++;
  }
  return chargeable;
}
