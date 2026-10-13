/**
 * Generates a comprehensive A4 business report PDF for BESTBRYT VENTURES.
 * Sections:
 *   1. Cover / summary stats
 *   2. Daily activity table (last N days)
 *   3. EOD branch reports
 *   4. Outstanding balances
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

// ─── Brand colours ────────────────────────────────────────────────────────────
const NAVY: [number, number, number]       = [15, 40, 80];
const GOLD: [number, number, number]       = [180, 135, 40];
const GREEN: [number, number, number]      = [22, 130, 80];
const RED: [number, number, number]        = [190, 45, 45];
const AMBER: [number, number, number]      = [180, 100, 20];
const GRAY_LIGHT: [number, number, number] = [245, 246, 248];
const GRAY_MID: [number, number, number]   = [110, 120, 135];
const WHITE: [number, number, number]      = [255, 255, 255];
const BLACK: [number, number, number]      = [20, 20, 30];

function ghs(n: number) {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return format(new Date(iso), "dd MMM yyyy, h:mm a");
}

function drawHeader(doc: jsPDF, pageWidth: number) {
  // Navy header bar
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 22, "F");
  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 22, pageWidth, 1.5, "F");
  // Business name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text("BESTBRYT VENTURES", 14, 14);
  // Right: report label
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 230);
  doc.text("Fuel Credit Management System", pageWidth - 14, 14, { align: "right" });
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, pageNum: number, totalPages: number) {
  doc.setFillColor(...GRAY_LIGHT);
  doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_MID);
  doc.text(
    `Generated on ${format(new Date(), "dd MMM yyyy, h:mm a")} · BESTBRYT VENTURES · Confidential`,
    14,
    pageHeight - 4
  );
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 14, pageHeight - 4, { align: "right" });
}

function sectionTitle(doc: jsPDF, text: string, y: number, pageWidth: number): number {
  doc.setFillColor(...NAVY);
  doc.rect(14, y, pageWidth - 28, 7.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(text.toUpperCase(), 18, y + 5.2);
  return y + 12;
}

// ─── Types (matching convex query return shapes) ──────────────────────────────

export type DailySummaryRow = {
  date: string;
  creditsCount: number;
  creditsGhs: number;
  paymentsCount: number;
  paymentsGhs: number;
};

export type EodReport = {
  _id: string;
  reportDate: string;
  submittedAt: string;
  branchName: string;
  branchCode: string;
  submittedByName: string;
  customersServed: number;
  creditsIssuedCount: number;
  creditsIssuedGhs: number;
  interestCollectedGhs: number;
  paymentsReceivedCount: number;
  paymentsReceivedGhs: number;
  penaltiesCollectedGhs: number;
  notes?: string;
};

export type OutstandingTx = {
  _id: string;
  driverName: string;
  driverAccountNumber: string;
  issuedAt: string;
  dueAt: string;
  isOverdue: boolean;
  overdueDays: number;
  fuelAmountGhs: number;
  penalty: number;
  remaining: number;
};

export type DashboardStats = {
  totalOutstandingGhs: number;
  overdueCount: number;
  activeDrivers: number;
  creditsTodayCount: number;
  creditsTodayGhs: number;
  pendingCount: number;
};

export interface ReportData {
  days: number;
  stats: DashboardStats;
  dailySummary: DailySummaryRow[];
  eodReports: EodReport[];
  outstandingItems: OutstandingTx[];
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateBusinessReportPdf(data: ReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const now = new Date();
  const reportTitle = `Business Report — Last ${data.days} Days`;
  const dateRange = `${format(new Date(now.getTime() - data.days * 86400000), "dd MMM yyyy")} – ${format(now, "dd MMM yyyy")}`;

  // ── Page 1: Cover / Summary ─────────────────────────────────────────────────
  drawHeader(doc, pageWidth);

  let y = 32;

  // Report title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(reportTitle, margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_MID);
  doc.text(dateRange, margin, y);
  y += 12;

  // ── Summary KPI boxes (2 × 3 grid) ─────────────────────────────────────────
  const kpiItems = [
    { label: "Active Drivers", value: data.stats.activeDrivers.toString(), color: NAVY },
    { label: "Pending Credits", value: data.stats.pendingCount.toString(), color: AMBER },
    { label: "Overdue Credits", value: data.stats.overdueCount.toString(), color: RED },
    { label: "Total Outstanding", value: ghs(data.stats.totalOutstandingGhs), color: RED },
    { label: "Credits Today", value: data.stats.creditsTodayCount.toString(), color: NAVY },
    { label: "Credits Today (GHS)", value: ghs(data.stats.creditsTodayGhs), color: GREEN },
  ];

  const boxW = (contentWidth - 4) / 3;
  const boxH = 20;
  const cols = 3;
  kpiItems.forEach((kpi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = margin + col * (boxW + 2);
    const by = y + row * (boxH + 2);

    doc.setFillColor(...GRAY_LIGHT);
    doc.roundedRect(bx, by, boxW, boxH, 2, 2, "F");
    doc.setFillColor(...kpi.color);
    doc.roundedRect(bx, by, 2.5, boxH, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.value, bx + 6, by + 7.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_MID);
    doc.text(kpi.label, bx + 6, by + 14);
  });

  y += 2 * (boxH + 2) + 10;

  // ── Daily activity summary table ────────────────────────────────────────────
  y = sectionTitle(doc, `Daily Activity (Last ${data.days} Days)`, y, pageWidth);

  const activeDays = [...data.dailySummary]
    .reverse()
    .filter((d) => d.creditsCount > 0 || d.paymentsCount > 0);

  if (activeDays.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_MID);
    doc.text("No activity recorded in this period.", margin, y + 5);
    y += 12;
  } else {
    const totalCredits = data.dailySummary.reduce((s, d) => s + d.creditsGhs, 0);
    const totalPayments = data.dailySummary.reduce((s, d) => s + d.paymentsGhs, 0);
    const totalCreditCount = data.dailySummary.reduce((s, d) => s + d.creditsCount, 0);
    const totalPaymentCount = data.dailySummary.reduce((s, d) => s + d.paymentsCount, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Date", "Credits (GHS)", "Txns", "Repayments (GHS)", "Pmts"]],
      body: activeDays.map((d) => [
        d.date,
        ghs(d.creditsGhs),
        d.creditsCount.toString(),
        ghs(d.paymentsGhs),
        d.paymentsCount.toString(),
      ]),
      foot: [["TOTAL", ghs(totalCredits), totalCreditCount.toString(), ghs(totalPayments), totalPaymentCount.toString()]],
      theme: "striped",
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8.5, fontStyle: "bold" },
      footStyles: { fillColor: [30, 55, 100], textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: BLACK },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { halign: "right" },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "right" },
        4: { halign: "center", cellWidth: 14 },
      },
      didParseCell: (hookData) => {
        // Highlight repayment column green in body
        if (hookData.section === "body" && hookData.column.index === 3) {
          hookData.cell.styles.textColor = GREEN;
          hookData.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── EOD Branch Reports ──────────────────────────────────────────────────────
  if (data.eodReports.length > 0) {
    // Group by date
    const byDate: Record<string, EodReport[]> = {};
    for (const r of data.eodReports) {
      (byDate[r.reportDate] ??= []).push(r);
    }
    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    // Check if we need a new page
    if (y > pageHeight - 60) {
      doc.addPage();
      drawHeader(doc, pageWidth);
      y = 32;
    }

    y = sectionTitle(doc, "Branch End-of-Day Reports", y, pageWidth);

    for (const date of sortedDates) {
      const dayReports = byDate[date];
      const dayCredits = dayReports.reduce((s, r) => s + r.creditsIssuedGhs, 0);
      const dayPayments = dayReports.reduce((s, r) => s + r.paymentsReceivedGhs, 0);
      const dayInterest = dayReports.reduce((s, r) => s + r.interestCollectedGhs, 0);
      const dayPenalties = dayReports.reduce((s, r) => s + r.penaltiesCollectedGhs, 0);
      const dayCustomers = dayReports.reduce((s, r) => s + r.customersServed, 0);

      // Date sub-heading
      if (y > pageHeight - 50) {
        doc.addPage();
        drawHeader(doc, pageWidth);
        y = 32;
      }

      doc.setFillColor(230, 235, 248);
      doc.rect(margin, y, contentWidth, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(
        format(new Date(date + "T12:00:00"), "EEEE, dd MMM yyyy") +
        `  ·  ${dayReports.length} branch${dayReports.length !== 1 ? "es" : ""}  ·  ${dayCustomers} customers`,
        margin + 3,
        y + 4.8
      );
      y += 9;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Branch", "Customers", "Credits (GHS)", "Payments (GHS)", "Interest", "Penalties", "Closed by"]],
        body: dayReports.map((r) => [
          `${r.branchCode} – ${r.branchName}`,
          r.customersServed.toString(),
          ghs(r.creditsIssuedGhs),
          ghs(r.paymentsReceivedGhs),
          ghs(r.interestCollectedGhs),
          ghs(r.penaltiesCollectedGhs),
          r.submittedByName,
        ]),
        foot: dayReports.length > 1
          ? [["TOTAL", dayCustomers.toString(), ghs(dayCredits), ghs(dayPayments), ghs(dayInterest), ghs(dayPenalties), ""]]
          : undefined,
        theme: "striped",
        headStyles: { fillColor: [50, 65, 110], textColor: WHITE, fontSize: 7.5, fontStyle: "bold" },
        footStyles: { fillColor: [30, 55, 100], textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
        bodyStyles: { fontSize: 8, textColor: BLACK },
        alternateRowStyles: { fillColor: [248, 249, 252] },
        columnStyles: {
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right", textColor: GREEN as [number, number, number] },
          4: { halign: "right" },
          5: { halign: "right", textColor: RED as [number, number, number] },
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }

  // ── Outstanding Balances ────────────────────────────────────────────────────
  if (data.outstandingItems.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      drawHeader(doc, pageWidth);
      y = 32;
    }

    y = sectionTitle(doc, `Outstanding Balances (${data.outstandingItems.length})`, y, pageWidth);

    const overdueItems = data.outstandingItems.filter((t) => t.isOverdue);
    const pendingItems = data.outstandingItems.filter((t) => !t.isOverdue);
    const totalOutstanding = data.outstandingItems.reduce((s, t) => s + t.remaining, 0);
    const totalPenalties = data.outstandingItems.reduce((s, t) => s + t.penalty, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Account", "Driver", "Issued", "Due Date", "Status", "Penalty", "Remaining"]],
      body: data.outstandingItems.map((tx) => [
        tx.driverAccountNumber,
        tx.driverName,
        format(new Date(tx.issuedAt), "dd MMM yyyy"),
        format(new Date(tx.dueAt), "dd MMM yyyy"),
        tx.isOverdue ? `${tx.overdueDays}d overdue` : "Pending",
        tx.penalty > 0 ? ghs(tx.penalty) : "—",
        ghs(tx.remaining),
      ]),
      foot: [[
        "", `${data.outstandingItems.length} credits`,
        `${overdueItems.length} overdue / ${pendingItems.length} pending`,
        "", "", ghs(totalPenalties), ghs(totalOutstanding),
      ]],
      theme: "striped",
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: "bold" },
      footStyles: { fillColor: [30, 55, 100], textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: BLACK },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: {
        0: { cellWidth: 28, font: "courier" },
        5: { halign: "right" },
        6: { halign: "right", fontStyle: "bold" },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body") {
          const statusVal = hookData.row.cells[4]?.raw as string ?? "";
          if (hookData.column.index === 4) {
            hookData.cell.styles.textColor = statusVal.includes("overdue") ? RED : AMBER;
            hookData.cell.styles.fontStyle = "bold";
          }
          if (hookData.column.index === 6) {
            hookData.cell.styles.textColor = statusVal.includes("overdue") ? RED : BLACK;
          }
        }
      },
    });
  }

  // ── Add page numbers to every page ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, pageWidth, pageHeight, i, totalPages);
  }

  const filename = `BBV-Report-${format(now, "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}
