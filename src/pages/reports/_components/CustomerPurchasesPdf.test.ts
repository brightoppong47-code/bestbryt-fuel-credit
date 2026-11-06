import { expect, it } from "vitest";
import { customerPurchasesPdf, rankCustomers, type CustomerBill } from "./CustomerPurchasesPdf";
const bill: CustomerBill = { billId: "BILL-1", customerId: "1", customer: "Same Name", account: "A001", branch: "A", issuedAt: "2026-10-01", dueAt: "2026-10-02", status: "paid", fuelGhs: 100, interestGhs: 5, upfrontInterestGhs: 5, recordedPenaltyGhs: 0, repaymentsGhs: 100, recordedBalanceGhs: 0 };
it("ranks by fuel value and counts bills, keeping customers with identical names separate", () => {
  const ranking = rankCustomers([bill, { ...bill, billId: "BILL-2" }, { ...bill, billId: "BILL-3", customerId: "2", account: "A002", fuelGhs: 250, interestGhs: 0 }]);
  expect(ranking.map(c => [c.customerId, c.purchases, c.fuelGhs])).toEqual([["2", 1, 250], ["1", 2, 200]]);
});
it("keeps the last bill when a PDF spans many pages and shows selected dates", () => {
  const doc = customerPurchasesPdf(Array.from({ length: 160 }, (_, i) => ({ ...bill, billId: `BILL-${i}` })), "Branch A", "2026-10-01", "2026-10-31");
  expect(doc.getNumberOfPages()).toBeGreaterThan(2);
  expect(doc.output()).toContain("BILL-159");
  expect(doc.output()).toContain("2026-10-31");
});
