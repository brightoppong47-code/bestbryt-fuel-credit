/**
 * Client-side PDF receipt generator for BESTBRYT VENTURES fuel credit system.
 * Generates two receipt types:
 *   1. Credit Issuance Receipt — when a new credit is issued
 *   2. Payment Receipt — when a payment (full or partial) is recorded
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

// ─── Brand colours ─────────────────────────────────────────────────────────────
const BRAND_DARK: [number, number, number] = [15, 40, 80];   // deep navy
const BRAND_GOLD: [number, number, number] = [201, 155, 50]; // gold accent
const BRAND_GREEN: [number, number, number] = [22, 130, 80]; // paid / green
const BRAND_RED: [number, number, number] = [190, 45, 45];   // overdue / red
const GRAY_LIGHT: [number, number, number] = [245, 246, 248];
const GRAY_MID: [number, number, number] = [110, 120, 135];
const BLACK: [number, number, number] = [20, 20, 30];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return format(new Date(iso), "dd MMM yyyy, h:mm a");
}

/** Draw the branded header block shared by both receipt types */
function drawHeader(doc: jsPDF, receiptTitle: string, receiptNumber: string, pageWidth: number) {
  // Navy header bar
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("BESTBRYT VENTURES", pageWidth / 2, 13, { align: "center" });

  // Gold underline
  doc.setDrawColor(...BRAND_GOLD);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 40, 15.5, pageWidth / 2 + 40, 15.5);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 195, 220);
  doc.text("FUEL CREDIT MANAGEMENT SYSTEM", pageWidth / 2, 21, { align: "center" });

  // Receipt title pill
  doc.setFillColor(...BRAND_GOLD);
  doc.roundedRect(pageWidth / 2 - 32, 25, 64, 9, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 20, 0);
  doc.text(receiptTitle.toUpperCase(), pageWidth / 2, 30.8, { align: "center" });

  // Receipt number + date (right-aligned in header)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 195, 220);
  doc.text(`Receipt: ${receiptNumber}`, pageWidth - 8, 35, { align: "right" });
  doc.text(`Printed: ${format(new Date(), "dd MMM yyyy, h:mm a")}`, pageWidth - 8, 39.5, { align: "right" });
}

/** Horizontal key-value row */
function drawRow(doc: jsPDF, y: number, label: string, value: string, pageWidth: number, bold = false, valueColor?: [number, number, number]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_MID);
  doc.text(label, 14, y);

  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(9);
  doc.setTextColor(...(valueColor ?? BLACK));
  doc.text(value, pageWidth - 14, y, { align: "right" });
}

/** Section heading */
function drawSection(doc: jsPDF, y: number, title: string, pageWidth: number): number {
  doc.setFillColor(...GRAY_LIGHT);
  doc.rect(10, y - 4, pageWidth - 20, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text(title.toUpperCase(), 14, y);
  return y + 6;
}

/** Divider line */
function drawDivider(doc: jsPDF, y: number, pageWidth: number) {
  doc.setDrawColor(220, 225, 232);
  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
}

/** Footer strip */
function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, pageHeight - 20, pageWidth, 20, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 195, 220);
  doc.text("BESTBRYT VENTURES  |  Fuel Credit Management System", pageWidth / 2, pageHeight - 12, { align: "center" });
  doc.text("This receipt is computer-generated and valid without a signature.", pageWidth / 2, pageHeight - 7, { align: "center" });
}

// ─── Public types ───────────────────────────────────────────────────────────────

export type CreditReceiptData = {
  receiptNumber: string;     // e.g. TX-XXXXXXX
  issuedAt: string;           // ISO date string
  dueAt: string;
  driverName: string;
  accountNumber: string;
  driverPhone: string;
  branchName: string;
  vehicleType: string;
  vehiclePlate: string;
  fuelAmountGhs: number;
  interestGhs: number;
  interestRatePercent?: number;
  interestCollectedUpfront: boolean;
  totalOwedGhs: number;
  issuedByName: string;
  notes?: string;
};

export type PaymentReceiptData = {
  receiptNumber: string;
  paymentDate: string;         // ISO date string
  driverName: string;
  accountNumber: string;
  driverPhone: string;
  branchName: string;
  fuelAmountGhs: number;
  interestGhs: number;
  interestRatePercent?: number;
  totalOwedGhs: number;
  penaltyGhs: number;
  liveTotal: number;
  amountPaidThisTime: number;
  previouslyPaid: number;
  remainingGhs: number;
  isFullyPaid: boolean;
  payments: Array<{ date: string; amount: number; note?: string }>;
  recordedByName: string;
  notes?: string;
};

// ─── Credit Issuance Receipt ────────────────────────────────────────────────────

export function generateCreditReceipt(data: CreditReceiptData): void {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  drawHeader(doc, "Fuel Credit Receipt", data.receiptNumber, W);

  let y = 48;

  // ── Driver section
  y = drawSection(doc, y, "Driver Information", W);
  y += 2;
  drawRow(doc, y, "Driver Name", data.driverName, W, true);   y += 6;
  drawRow(doc, y, "Account Number", data.accountNumber, W);   y += 6;
  drawRow(doc, y, "Phone", data.driverPhone, W);              y += 6;
  drawRow(doc, y, "Branch", data.branchName, W);              y += 6;
  drawRow(doc, y, "Vehicle", `${data.vehicleType} — ${data.vehiclePlate}`, W); y += 6;
  drawDivider(doc, y, W); y += 6;

  // ── Credit section
  y = drawSection(doc, y, "Credit Details", W);
  y += 2;
  drawRow(doc, y, "Issued On", fmtDate(data.issuedAt), W);    y += 6;
  drawRow(doc, y, "Due Date", fmtDate(data.dueAt), W, false, BRAND_RED); y += 6;
  drawRow(doc, y, "Issued By", data.issuedByName, W);         y += 6;
  drawDivider(doc, y, W); y += 6;

  // ── Financial summary table
  y = drawSection(doc, y, "Financial Summary", W);
  y += 2;

  const tableBody: [string, string][] = [
    ["Fuel Principal", `GHS ${fmt(data.fuelAmountGhs)}`],
    [
      data.interestCollectedUpfront
        ? `Interest (${data.interestRatePercent ?? 5}%) — collected upfront`
        : `Interest (${data.interestRatePercent ?? 5}%)`,
      `GHS ${fmt(data.interestGhs)}`,
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Description", "Amount"]],
    body: tableBody,
    foot: [["TOTAL AMOUNT DUE", `GHS ${fmt(data.totalOwedGhs)}`]],
    theme: "plain",
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: {
      fillColor: BRAND_DARK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    footStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9.5,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Interest upfront notice
  if (data.interestCollectedUpfront) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(180, 220, 200);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, y, W - 28, 9, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("✓  Interest was collected from the driver at time of issuing.", 18, y + 5.5);
    y += 12;
  }

  // Notes
  if (data.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_MID);
    doc.text(`Note: ${data.notes}`, 14, y, { maxWidth: W - 28 });
    y += 8;
  }

  // Authorisation line
  y = Math.max(y, H - 45);
  drawDivider(doc, y, W); y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  doc.text("Authorised Signature: ________________________", 14, y);
  doc.text("Driver Signature: ____________________________", 14, y + 8);

  drawFooter(doc, W, H);

  const filename = `BBV-Credit-Receipt-${data.accountNumber}-${data.issuedAt.slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ─── Payment Receipt ────────────────────────────────────────────────────────────

export function generatePaymentReceipt(data: PaymentReceiptData): void {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  drawHeader(
    doc,
    data.isFullyPaid ? "Full Payment Receipt" : "Part Payment Receipt",
    data.receiptNumber,
    W
  );

  let y = 48;

  // ── Driver section
  y = drawSection(doc, y, "Driver Information", W);
  y += 2;
  drawRow(doc, y, "Driver Name", data.driverName, W, true);   y += 6;
  drawRow(doc, y, "Account Number", data.accountNumber, W);   y += 6;
  drawRow(doc, y, "Phone", data.driverPhone, W);              y += 6;
  drawRow(doc, y, "Branch", data.branchName, W);              y += 6;
  drawDivider(doc, y, W); y += 6;

  // ── Payment section
  y = drawSection(doc, y, "Payment Details", W);
  y += 2;
  drawRow(doc, y, "Payment Date", fmtDate(data.paymentDate), W);        y += 6;
  drawRow(doc, y, "Recorded By", data.recordedByName, W);               y += 6;
  drawRow(doc, y, "Status", data.isFullyPaid ? "FULLY PAID" : "PARTIAL PAYMENT", W, true,
    data.isFullyPaid ? BRAND_GREEN : [180, 120, 30]);
  y += 6;
  drawDivider(doc, y, W); y += 6;

  // ── Financial breakdown table
  y = drawSection(doc, y, "Financial Breakdown", W);
  y += 2;

  const rows: [string, string][] = [
    ["Fuel Principal", `GHS ${fmt(data.fuelAmountGhs)}`],
    [`Interest (${data.interestRatePercent ?? 5}%)`, `GHS ${fmt(data.interestGhs)}`],
    ["Sub-total (Principal + Interest)", `GHS ${fmt(data.totalOwedGhs)}`],
  ];

  if (data.penaltyGhs > 0) {
    rows.push(["Penalty (overdue)", `GHS ${fmt(data.penaltyGhs)}`]);
    rows.push(["Grand Total (incl. penalty)", `GHS ${fmt(data.liveTotal)}`]);
  }

  if (data.previouslyPaid > 0) {
    rows.push(["Previously Paid", `− GHS ${fmt(data.previouslyPaid)}`]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Description", "Amount"]],
    body: rows,
    theme: "striped",
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: BRAND_DARK,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Prominent "Amount Received" box
  const boxH = 14;
  doc.setFillColor(...(data.isFullyPaid ? BRAND_GREEN : BRAND_GOLD));
  doc.roundedRect(14, y, W - 28, boxH, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("AMOUNT RECEIVED", 20, y + 5);
  doc.setFontSize(13);
  doc.text(`GHS ${fmt(data.amountPaidThisTime)}`, W - 18, y + 10, { align: "right" });
  y += boxH + 4;

  // Remaining balance (when not fully paid)
  if (!data.isFullyPaid) {
    doc.setFillColor(255, 245, 230);
    doc.setDrawColor(...BRAND_RED);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, y, W - 28, 9, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_RED);
    doc.text(`Remaining Balance: GHS ${fmt(data.remainingGhs)}`, 18, y + 5.5);
    y += 13;
  }

  // Payment history table (only if multiple payments)
  if (data.payments.length > 1) {
    y += 2;
    y = drawSection(doc, y, "Payment History", W);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [["#", "Date", "Amount (GHS)", "Note"]],
      body: data.payments.map((p, i) => [
        String(i + 1),
        format(new Date(p.date), "dd MMM yyyy"),
        fmt(p.amount),
        p.note ?? "",
      ]),
      foot: [["", "Total Paid", fmt(data.payments.reduce((s, p) => s + p.amount, 0)), ""]],
      theme: "plain",
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: GRAY_LIGHT, textColor: BLACK, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fontStyle: "bold", fillColor: GRAY_LIGHT },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 32 },
        2: { halign: "right", cellWidth: 30 },
        3: { cellWidth: "auto" },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // Notes
  if (data.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_MID);
    doc.text(`Note: ${data.notes}`, 14, y, { maxWidth: W - 28 });
    y += 8;
  }

  // Authorisation line
  y = Math.max(y, H - 38);
  drawDivider(doc, y, W); y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_MID);
  doc.text("Authorised Signature: ________________________", 14, y);
  doc.text("Driver Signature: ____________________________", 14, y + 8);

  drawFooter(doc, W, H);

  const filename = `BBV-Payment-Receipt-${data.accountNumber}-${data.paymentDate.slice(0, 10)}.pdf`;
  doc.save(filename);
}
