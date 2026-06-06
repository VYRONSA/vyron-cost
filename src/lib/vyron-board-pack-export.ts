import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { BoardPackData } from "@/lib/vyron-finance-intelligence";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function drawSection(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(67, 56, 202);
  doc.roundedRect(14, y - 6, 182, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 18, y);
  doc.setTextColor(15, 23, 42);
}

export function exportBoardPackPdf(pack: BoardPackData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generated = new Date(pack.meta.generatedAt);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 297, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("VYRON COST", 14, 32);
  doc.setFontSize(14);
  doc.text("Executive Board Pack", 14, 44);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Company: ${pack.meta.companyName}`, 14, 58);
  doc.text(`Date Range: ${pack.meta.dateRangeLabel}`, 14, 65);
  doc.text(`Generated: ${generated.toLocaleString()}`, 14, 72);

  doc.addPage();
  let y = 14;

  const sections: Array<{ title: string; rows: string[][] }> = [
    {
      title: "1. Executive Summary",
      rows: [
        ["Total Spend (Month)", money(pack.executiveSummary.spendThisMonth)],
        ["Total Spend (Year)", money(pack.executiveSummary.spendThisYear)],
        ["Inventory Value", money(pack.executiveSummary.inventoryValue)],
        ["Production Cost", money(pack.executiveSummary.productionCost)],
        ["Potential Recovery", money(pack.executiveSummary.potentialRecovery)],
        ["Verified Recovery", money(pack.executiveSummary.verifiedRecovery)],
        ["Recovered Value", money(pack.executiveSummary.recoveredValue)],
        ["Supplier Inflation Impact", money(pack.executiveSummary.supplierInflationImpact)],
        ["Projected Annual Cost Impact", money(pack.executiveSummary.projectedAnnualCostImpact)],
      ],
    },
    {
      title: "2. Procurement",
      rows: [
        ["Supplier inflation", `${pack.procurement.supplierInflation}%`],
        ["PO variances", String(pack.procurement.poVariances)],
        ["Open POs", String(pack.procurement.openPos)],
        ["Partial GRNs", String(pack.procurement.grnPartial)],
        ...pack.procurement.supplierSpendTop.slice(0, 5).map((s) => [`Spend: ${s.name}`, money(s.spend)]),
      ],
    },
    {
      title: "3. Inventory",
      rows: [
        ["Inventory value", money(pack.inventory.inventoryValue)],
        ["Low stock", String(pack.inventory.lowStock)],
        ["Slow moving", String(pack.inventory.slowMoving)],
        ["Overstock", String(pack.inventory.overstock)],
        ["Variances", money(pack.inventory.inventoryVariance)],
      ],
    },
    {
      title: "4. Manufacturing",
      rows: [
        ["Production cost", money(pack.manufacturing.productionCost)],
        ["Yield %", `${pack.manufacturing.yieldPct}%`],
        ["Wastage %", `${pack.manufacturing.wastagePct}%`],
        ["Finished goods value", money(pack.manufacturing.finishedGoodsValue)],
        ["Production variances", String(pack.manufacturing.productionVariances)],
      ],
    },
    {
      title: "5. Supplier Intelligence",
      rows: [
        ...pack.supplier.topInflation.map((s) => [`Inflation: ${s.name}`, `${s.pct.toFixed(1)}%`]),
        ...pack.supplier.topRisk.map((s) => [`Risk: ${s.name}`, `${s.level} (${s.score})`]),
        ...pack.supplier.topSavings.map((s) => [`Savings: ${s.name}`, money(s.amount)]),
      ],
    },
    {
      title: "6. Recovery",
      rows: [
        ["Potential", money(pack.recovery.potentialRecovery)],
        ["Verified", money(pack.recovery.verifiedRecovery)],
        ["Recovered", money(pack.recovery.recoveredValue)],
        ["Open opportunities", String(pack.recovery.openOpportunities)],
        ["Success %", `${pack.recovery.recoverySuccessPct.toFixed(1)}%`],
        ...pack.recovery.funnel.map((f) => [f.status, String(f.count)]),
      ],
    },
    {
      title: "7. AI Recommendations",
      rows: [
        ["High risk alerts", String(pack.ai.highRiskAlerts)],
        ["Projected savings", money(pack.ai.projectedSavings)],
        ["Projected cost increases", money(pack.ai.projectedCostIncreases)],
        ...pack.ai.topRecommendations.map((r) => [r.title, `${money(r.annual)}/yr · ${r.confidence}%`]),
        ...pack.ai.recommendedActions.map((a) => ["Action", a]),
      ],
    },
    {
      title: "8. Audit Summary",
      rows: [
        ["Cost changes", String(pack.audit.costChanges)],
        ["Approvals", String(pack.audit.approvals)],
        ["Overrides", String(pack.audit.overrides)],
        ["PO variances", String(pack.audit.poVariances)],
        ["Inventory adjustments", String(pack.audit.inventoryAdjustments)],
        ["Production variances", String(pack.audit.productionVariances)],
        ...pack.audit.recentEvents.slice(0, 8).map((e) => [new Date(e.when).toLocaleDateString(), `${e.type}: ${e.detail}`]),
      ],
    },
  ];

  for (const section of sections) {
    if (y > 250) {
      doc.addPage();
      y = 14;
    }
    drawSection(doc, section.title, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      head: [["Metric", "Value"]],
      body: section.rows,
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y) + 10;
  }

  doc.save(`vyron-board-pack-${generated.toISOString().slice(0, 10)}.pdf`);
}

function packToSheets(pack: BoardPackData): Record<string, string[][]> {
  return {
    Summary: [
      ["Company", pack.meta.companyName],
      ["Date Range", pack.meta.dateRangeLabel],
      ["Generated", pack.meta.generatedAt],
      ["Spend Month", String(pack.executiveSummary.spendThisMonth)],
      ["Spend Year", String(pack.executiveSummary.spendThisYear)],
      ["Inventory", String(pack.executiveSummary.inventoryValue)],
      ["Production Cost", String(pack.executiveSummary.productionCost)],
      ["Potential Recovery", String(pack.executiveSummary.potentialRecovery)],
      ["Recovered", String(pack.executiveSummary.recoveredValue)],
    ],
    Procurement: [["Supplier", "Spend"], ...pack.procurement.supplierSpendTop.map((s) => [s.name, String(s.spend)])],
    Recovery: [["Title", "Value", "Status"], ...pack.recovery.topOpportunities.map((o) => [o.title, String(o.value), o.status])],
    AI: [["Title", "Category", "Annual", "Confidence"], ...pack.ai.topRecommendations.map((r) => [r.title, r.category, String(r.annual), String(r.confidence)])],
    Audit: [["When", "Type", "Detail"], ...pack.audit.recentEvents.map((e) => [e.when, e.type, e.detail])],
  };
}

export function exportBoardPackExcel(pack: BoardPackData) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(packToSheets(pack))) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  }
  XLSX.writeFile(wb, `vyron-board-pack-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportBoardPackCsv(pack: BoardPackData) {
  const lines: string[] = ["VYRON COST BOARD PACK", ""];
  for (const [name, rows] of Object.entries(packToSheets(pack))) {
    lines.push(`## ${name}`);
    for (const row of rows) {
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vyron-board-pack-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
