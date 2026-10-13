# BESTBRYT collections report update

This package is edited source code, not a live deployment or an APK.

Changes:
- Reports: inclusive from/to dates in Ghana time (UTC), branch filter, 7/14/30-day shortcuts.
- Separate payments received (principal), interest collected, penalties collected, total cash received.
- Cash includes upfront interest on its issue date and repayments on their actual payment date.
- Chart, detail table, PDF and CSV use the same filters and accounting totals.
- New repayments and final settlements save component amounts and the branch at payment time.
- Repayments apply to principal first, then deferred interest, then penalties.
- Overpayments are rejected instead of recording more cash than the remaining debt.
- Old payments are reconstructed chronologically using that same order and visibly marked. This does not establish how historical cash was actually allocated. No historical records are rewritten.
- Previously submitted EOD snapshots remain visible and unchanged. Current outstanding balances remain a separate current-state section. These sections explicitly do not use the collection date/branch filters.

Example: a repayment of GHS230 against GHS200 principal and GHS30 penalties shows principal 200, penalties 30, cash 230. If GHS10 interest was also collected upfront within the report dates, interest is 10 and total cash is 240.

Installation:
1. Keep your original archive and download a fresh data backup.
2. Use this source in your existing project with its existing environment variables and credentials. No production credentials are included in this export.
3. Install dependencies with `pnpm install --frozen-lockfile`.
4. Deploy the Convex schema and functions to the existing database, using the project's normal deployment process. Regenerate Convex API types through that process.
5. Build the frontend with `pnpm build` and publish it to the existing hosting project after the backend update. Preserve the existing Hercules authentication and Convex environment settings.
6. Verify on a test account: select a branch/date range, record a partial repayment and then settle it, check all four collection totals, and compare PDF/CSV results.

Validation completed: frontend production build, frontend/backend TypeScript checks, targeted ESLint checks, and four backend accounting tests. Existing build warnings: missing Hercules website environment value in this exported environment, CSS font-import order, large JS bundle. Live login, database deployment and browser verification require the existing project configuration and were not performed.

Primary changed files:
- convex/schema.ts
- convex/transactions.ts
- convex/lib/paymentAllocation.ts (new)
- convex/reports.ts (new)
- convex/reports.test.ts (new)
- convex/_generated/api.d.ts
- src/pages/reports/page.tsx
- src/pages/reports/_components/CollectionsReport.tsx (new)
