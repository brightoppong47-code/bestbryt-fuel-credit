import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatGhs } from "./ReconciliationPdf";
export type CustomerBill = { billId: string; customerId: string; customer: string; account: string; branch: string; issuedAt: string; dueAt: string; status: string; fuelGhs: number; interestGhs: number; upfrontInterestGhs: number; recordedPenaltyGhs: number; repaymentsGhs: number; recordedBalanceGhs: number };
export function rankCustomers(bills: CustomerBill[]) {
  const customers = new Map<string, { customerId: string; customer: string; account: string; purchases: number; fuelGhs: number }>();
  for (const b of bills) {
    const row = customers.get(b.customerId) ?? { customerId: b.customerId, customer: b.customer, account: b.account, purchases: 0, fuelGhs: 0 };
    row.purchases++; row.fuelGhs += b.fuelGhs; customers.set(b.customerId, row);
  }
  return [...customers.values()].map(c => ({ ...c, fuelGhs: Math.round(c.fuelGhs * 100) / 100 })).sort((a, b) => b.fuelGhs - a.fuelGhs || b.purchases - a.purchases || a.account.localeCompare(b.account));
}
export const billHeadings = ["Bill ID", "Customer / account", "Purchase date", "Fuel GHS", "Interest GHS", "Upfront interest GHS", "Recorded penalty GHS", "Repayments GHS", "Recorded balance GHS", "Status"];
export const billRows = (bills: CustomerBill[]) => bills.map(b => [b.billId, `${b.customer}\n${b.account}`, b.issuedAt.slice(0, 10), ...[b.fuelGhs, b.interestGhs, b.upfrontInterestGhs, b.recordedPenaltyGhs, b.repaymentsGhs, b.recordedBalanceGhs].map(formatGhs), b.status]);
export function customerPurchasesPdf(bills: CustomerBill[], scope: string, from: string, to: string) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const ranked = rankCustomers(bills);
  const table = (title: string, head: string[], body: string[][]) => {
    doc.setFontSize(12); doc.setTextColor(15, 40, 80); doc.text(title, 14, 51);
    autoTable(doc, { head: [head], body: body.length ? body : [["No purchases in this period."]], startY: 56, margin: { top: 49, bottom: 21 }, styles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" }, headStyles: { fillColor: [15, 40, 80] }, alternateRowStyles: { fillColor: [245, 247, 250] } });
  };
  table("Customers ranked by total fuel purchased", ["Rank", "Customer", "Account", "Purchase count", "Fuel purchased GHS"], ranked.map((c, i) => [String(i + 1), c.customer, c.account, String(c.purchases), formatGhs(c.fuelGhs)]));
  doc.addPage(); table("Bill-by-bill purchase details", billHeadings, billRows(bills));
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFillColor(15, 40, 80); doc.rect(0, 0, 297, 23, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.text("BESTBRYT VENTURES", 14, 10); doc.setFontSize(10); doc.text("Customer purchases & bill report", 14, 18);
    doc.setTextColor(30, 40, 55); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(`${scope} | Purchases: ${from} to ${to} (inclusive, UTC)`, 269), 14, 29);
    doc.text(`${bills.length} purchases | ${ranked.length} customers | Fuel purchased GHS ${formatGhs(bills.reduce((s, b) => s + b.fuelGhs, 0))}`, 14, 41);
    doc.setFontSize(7); doc.text("One issued fuel bill = one purchase. Ranking excludes interest and penalties. Branch follows current customer assignment.", 14, 194);
    doc.text("Repayments exclude upfront interest. Balances and penalties are recorded values at export, not a historical closing or projected penalty.", 14, 198);
    doc.text(`Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC | Page ${p} of ${pages}`, 283, 205, { align: "right" });
  }
  return doc;
}
