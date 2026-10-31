import { describe, expect, it } from "vitest";
import { createReconciliationPdf, reconciliationTotals, type ReconciliationResults } from "./ReconciliationPdf";

const results: ReconciliationResults = {
  payments: [
    { _id: "p1", amountGhs: 100, recordedAt: "2026-10-31T08:00:00Z", paymentMethod: "cash", reconciliationStatus: "verified" },
    { _id: "p2", amountGhs: 50, recordedAt: "2026-10-31T09:00:00Z", paymentMethod: "staff_momo", reconciliationStatus: "pending" },
    { _id: "p3", amountGhs: 25, recordedAt: "2026-10-31T10:00:00Z", reconciliationStatus: "disputed" },
  ],
  handovers: [{ _id: "h1", amountGhs: 150, recordedAt: "2026-11-01T08:00:00Z", collectionDate: "2026-10-31", method: "cash", status: "verified" }],
};
describe("reconciliation PDF", () => {
  it("keeps handovers out of customer receipts and legacy payments out of cash", () => {
    const totals = Object.fromEntries(reconciliationTotals(results));
    expect(totals["Customer payments"]).toBe(175);
    expect(totals["Cash payments"]).toBe(100);
    expect(totals["Unclassified legacy payments"]).toBe(25);
    expect(totals["Verified payments"]).toBe(100);
    expect(totals["Pending payments"]).toBe(50);
    expect(totals["Disputed payments"]).toBe(25);
    expect(totals["Verified handovers"]).toBe(150);
  });
  it("exports all rows across multiple pages, including long references and legacy dates", () => {
    const many = { ...results, payments: Array.from({ length: 130 }, (_, i) => ({ ...results.payments[0], _id: `p${i}`, externalReference: i === 129 ? "LAST-REFERENCE-129" : "A".repeat(120) })), handovers: [{ ...results.handovers[0], collectionDate: undefined }] };
    const doc = createReconciliationPdf(many, "Head Office", "2026-10-31");
    const pdf = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(pdf).toContain("LAST-REFERENCE-129");
    expect(pdf).toContain("Unallocated legacy");
    expect(pdf).toContain("Head Office");
    expect(pdf).toContain(`Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`);
  });
  it("prints an explicit empty result instead of missing sections", () => {
    const doc = createReconciliationPdf({ payments: [], handovers: [] }, "Branch A", "2026-10-31");
    expect(doc.getNumberOfPages()).toBe(3);
    expect(doc.output()).toContain("No records for this selection.");
  });
});
