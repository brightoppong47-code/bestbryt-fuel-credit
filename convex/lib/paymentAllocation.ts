/** Repayments settle principal, then deferred interest, then penalties. */
export function allocatePayment(amount: number, alreadyPaid: number, principal: number, interest: number) {
  const cents = (n: number) => Math.max(0, Math.round(n * 100));
  let remaining = cents(amount);
  const paid = cents(alreadyPaid);
  const principalCents = cents(principal);
  const principalGhs = Math.min(remaining, Math.max(0, principalCents - paid));
  remaining -= principalGhs;
  const interestGhs = Math.min(remaining, Math.max(0, cents(interest) - Math.max(0, paid - principalCents)));
  remaining -= interestGhs;
  return { principalGhs: principalGhs / 100, interestGhs: interestGhs / 100, penaltyGhs: remaining / 100 };
}
