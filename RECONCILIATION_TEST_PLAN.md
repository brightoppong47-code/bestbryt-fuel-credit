# BESTBRYT reconciliation pre-deployment test plan

Status: **NOT EXECUTED**. This checklist does not authorize production deployment or live database writes.

## Build and static checks
In an isolated checkout of this branch, with development-only Convex credentials and generated API types:
```sh
npm ci
npm run build
npm run lint
npm test
```
Record each command's exit status and error log. Do not substitute an absence of workflow runs for a passing test.

## Safe sandbox scenario
Use a separate Convex development deployment and synthetic customer/branch records. Never test payments against real customer accounts.

1. Staff records a GHS 100 cash customer payment and GHS 50 staff-MoMo customer payment. Both must have pending reconciliation and unique receipt numbers.
2. Staff records a GHS 150 cash handover against the original collection date. Customer debt must remain unchanged by the handover.
3. Admin verifies the handover with evidence. Verify exactly one handover review event exists and that the handover amount is NOT counted as new customer revenue.
4. Admin verifies the original payments individually; a second review attempt must fail.
5. Record a GHS 75 collection on Monday and hand it over Tuesday, selecting Monday as the collection date. Monday's handover queue must show it; Tuesday's collection receipts must not increase.
6. Staff tries to review a payment/handover; request must fail with owner-only authorization. Staff assigned to branch A tries to hand over for branch B; request must fail.
7. Risk manager attempts to record a handover through the backend; request must fail.
8. Company-MoMo handover without a reference, zero/negative amount, more than two decimal places, or future collection date must fail.
9. Check legacy payment without paymentMethod stays unclassified; old handover without collectionDate stays identifiable and must not be silently allocated.
10. Confirm staff UI displays only assigned branches; admin can select permitted branches.

## Blocking limitations
- A collection date is not an allocation to specific payments; overlapping handovers, partial handovers, and multi-day deposits need a ledger/allocation model before claiming exact outstanding balances.
- The current admin review queue scans all payments and filters in memory. Add indexed/paginated queries before large production volumes.
- Payments without branchId can be omitted from branch summaries; audit legacy migration before relying on totals.
- Verify company MoMo receipts against independent statements, not just user-entered reference numbers.
- Confirm generated Convex API types, TypeScript build, role tests and UI interactions all pass before a deployment request.

**Release gate:** No production schema push, deployment, or live-data changes without explicit approval after test evidence is reviewed.
