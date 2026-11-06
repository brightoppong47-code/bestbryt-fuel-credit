import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReconciliationResults = {
  payments: { _id: string; amountGhs: number; recordedAt: string; paymentMethod?: string; externalReference?: string; receiptNumber?: string; reconciliationStatus: string }[];
  handovers: { _id: string; amountGhs: number; recordedAt: string; collectionDate?: string; method: string; externalReference?: string; status: string }[];
};
export const formatGhs = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const paymentMethodLabel = (method?: string) => ({ cash: "Cash", company_momo: "Company MoMo", staff_momo: "Staff MoMo" }[method ?? ""] ?? "Unclassified legacy");
export function reconciliationTotals(data: ReconciliationResults) {
  const sum = (rows: { amountGhs: number }[]) => Math.round(rows.reduce((n, r) => n + r.amountGhs, 0) * 100) / 100;
  return [
    ["Customer payments", sum(data.payments)],
    ["Cash payments", sum(data.payments.filter(p => p.paymentMethod === "cash"))],
    ["Company MoMo payments", sum(data.payments.filter(p => p.paymentMethod === "company_momo"))],
    ["Staff MoMo payments", sum(data.payments.filter(p => p.paymentMethod === "staff_momo"))],
    ["Unclassified legacy payments", sum(data.payments.filter(p => !p.paymentMethod))],
    ["Verified payments", sum(data.payments.filter(p => p.reconciliationStatus === "verified"))],
    ["Pending payments", sum(data.payments.filter(p => p.reconciliationStatus === "pending"))],
    ["Disputed payments", sum(data.payments.filter(p => p.reconciliationStatus === "disputed"))],
    ["Recorded handovers (separate)", sum(data.handovers)],
    ["Verified handovers", sum(data.handovers.filter(h => h.status === "verified"))],
    ["Pending handovers", sum(data.handovers.filter(h => h.status === "pending"))],
    ["Disputed handovers", sum(data.handovers.filter(h => h.status === "disputed"))],
  ] as [string, number][];
}

export function createReconciliationPdf(data: ReconciliationResults, branch: string, date: string) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const table = (title: string, head: string[], body: string[][]) => {
    doc.setFontSize(12); doc.setTextColor(15, 40, 80); doc.text(title, 14, 45);
    autoTable(doc, { startY: 50, margin: { top: 45, bottom: 16, left: 14, right: 14 },
      head: [head], body: body.length ? body : [["No records for this selection."]],
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 40, 80] }, alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  };
  table("Reconciliation summary (GHS)", ["Measure", "Amount (GHS)"], reconciliationTotals(data).map(([label, amount]) => [label, formatGhs(amount)]));
  doc.addPage();
  table("Customer payments", ["Receipt / record ID", "Recorded (UTC)", "Method", "Reference", "Status", "Amount (GHS)"], data.payments.map(p => [p.receiptNumber ?? `Legacy: ${p._id}`, p.recordedAt.replace("T", " ").slice(0, 19), paymentMethodLabel(p.paymentMethod), p.externalReference ?? "-", p.reconciliationStatus, formatGhs(p.amountGhs)]));
  doc.addPage();
  table("Staff handovers (not additional customer payments)", ["Record ID", "Collection date", "Recorded (UTC)", "Method", "Reference", "Status", "Amount (GHS)"], data.handovers.map(h => [h._id, h.collectionDate ?? "Unallocated legacy", h.recordedAt.replace("T", " ").slice(0, 19), paymentMethodLabel(h.method), h.externalReference ?? "-", h.status, formatGhs(h.amountGhs)]));
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i); doc.setFillColor(15, 40, 80); doc.rect(0, 0, width, 23, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.text("BESTBRYT VENTURES", 14, 10);
    doc.setFontSize(10); doc.text("Collection Reconciliation Report", 14, 18);
    doc.setTextColor(30, 40, 55); doc.setFontSize(9);
    const scope = doc.splitTextToSize(`Branch: ${branch} | Collection date: ${date} | Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`, width - 28);
    doc.text(scope, 14, 29);
    doc.setFontSize(7);
    doc.text("Handovers are separate from customer receipts. Legacy methods stay unclassified; exact outstanding funds require payment allocation.", 14, height - 10);
    doc.text(`Confidential | Page ${i} of ${count}`, width - 14, height - 5, { align: "right" });
  }
  return doc;
}
