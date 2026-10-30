# BESTBRYT Fuel Credit — Production Security Audit

Date: 2026-10-30
Status: In progress. Read-only source review; no production tests performed.
Business context: Live customer transactions; staff receive cash, company MoMo and staff MoMo. Staff may settle customer debts; admin independently reconciles collections. Staff hand over funds daily.

## Confirmed source-code observations

1. **HIGH — Unverified full settlement**: `convex/transactions.ts::markPaid` accepts an authorized staff user's request and automatically inserts a payment for the remaining debt, then marks the transaction paid. No independent proof of receipt or reconciliation is required. This is a business fraud/control risk, not proof of unauthorized external access.
2. **HIGH — No payment-method or reconciliation ledger**: `convex/schema.ts::payments` records amount, transaction, customer, staff and time, but not cash/company MoMo/staff MoMo, external reference, verification state, cash handover, or independent verifier.
3. **MEDIUM — Reports conflate channels**: `convex/reports.ts::collections` aggregates payment amounts under `cashGhs` regardless of payment channel. Historical payments lack method metadata; do not retroactively classify them as cash.
4. **MEDIUM — Upload permission**: `convex/drivers.ts::generateUploadUrl` checks for authentication only, unlike other staff-gated driver operations. Review uploaded content validation, file ownership and retention.
5. **REVIEW REQUIRED — Onboarding**: `convex/users.ts::updateCurrentUser` has an uninvited staff fallback, while `convex/auth.ts` restricts registration through its callback. Test the entire authentication path in an isolated environment before calling it exploitable.
6. **POSITIVE — Branch checks**: `convex/helpers.ts` implements `assertDriverAccess` and `assertTransactionAccess`; `recordPayment` and `markPaid` use them. Review other endpoints separately.

## Agreed target controls

- Keep staff settlement available.
- Distinguish debt settlement from independently verified collection.
- Payment method: cash, company MoMo, staff MoMo.
- Each payment gets immutable receipt ID, actor, timestamp, and optional external reference.
- Track staff-held funds and handovers independently from customer payments; never count a handover as a second customer payment.
- Daily close with discrepancy and overdue-handover flags.
- Admin-only reconciliation with immutable adjustment/audit trail.
- Branch isolation for all staff-facing records and uploads.
- Preserve historical data and existing balances; classify legacy payment method as unknown until verified.

## Release gates

1. Audit remaining Convex endpoints and auth configuration, frontend and repository secrets exposure.
2. Design backward-compatible schema and migration approach; avoid overwriting old payment rows.
3. Implement on this security branch only.
4. Test partial payments, full settlement, penalties, staff/branch restrictions, three payment methods, partial handovers, reconciliation and legacy reports with synthetic data.
5. Review changes and backup/restore procedure before any production release.
6. Deploy only with explicit approval and verified rollback plan.

No penetration testing, live payment changes, production database access or deployment performed.
