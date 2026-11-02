# Admin transaction and penalty adjustments — implementation design

Status: DESIGN ONLY. Not deployed or implemented. Testing branch only.

## Authorization and workflow
- Only authenticated `owner` may create adjustments (enforced in Convex mutation with `requireOwner`); staff and risk managers can view only records authorized by existing branch rules.
- Admin opens a transaction and selects principal correction, interest correction, or penalty adjustment; enters signed GHS amount and mandatory reason, previews old/new amounts, confirms.
- Never modify historical payment rows, receipt amounts, or reconciled collection entries. Paid transactions require separate explicit reversal/correction workflow rather than silently reopening.

## Financial invariants
- Persist immutable adjustment events (transactionId, component, signed delta in integer pesewas, old/new values, reason, actor, timestamp).
- Store aggregate principal/interest adjustments and penalty adjustments separately; don't rewrite original issued amounts.
- Calculate penalty from the original schedule and current penalty rules plus accumulated adjustments. Waivers must not be undone by the next automatic refresh. Define whether waivers cover accrued charges only or future charges; a permanent waiver requires a distinct no-future-accrual flag.
- Use a single shared balance calculator across getTransaction, listTransactions, getDriverBalance, dashboard, markPaid, recordPayment, and refreshPenalties. Ensure the same logic applies to 70% arrears eligibility.
- Prevent NaN, infinities, negative principal/interest/penalty, totals below recorded payments, and double submission. Round currency consistently to pesewas.
- Interest collected upfront must not silently be treated as unpaid debt when corrected. Reconcile financial effects of corrections separately from money collected.

## Testing before release
1. Owner can raise/lower each eligible component; non-owner is denied server-side.
2. Penalty waiver survives refresh, page reload, and subsequent automatic accrual as defined by waiver scope.
3. Existing partial payments and reconciled receipts remain unchanged.
4. All balance views and reports agree before/after adjustment.
5. Reject adjustment that would make payable amount lower than recorded payments.
6. Ensure audit log records reason, actor, old/new values and cannot be edited.
7. Run isolated development deployment and CI tests; do not deploy or merge production without approval.
