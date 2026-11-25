import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { ProductionControlReport } from "@/lib/vyron-production-control";

/**
 * Exports of the Daily Production Control Report. Every section is exported
 * from the same report object the screen renders, so a printed pack cannot
 * disagree with the screen.
 */

type Section = { title: string; head: string[]; rows: (string | number)[][] };

const q = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { maximumFractionDigits: dp });
const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "Not available" : `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "Not available" : `${n.toFixed(1)}%`);

export function productionControlSections(r: ProductionControlReport): { kpis: [string, string][]; sections: Section[] } {
  const k = r.kpis;
  const kpis: [string, string][] = [
    ["Jobs scheduled", String(k.jobsScheduled)],
    ["Jobs completed", String(k.jobsCompleted)],
    ["Jobs in progress", String(k.jobsInProgress)],
    ["Jobs not started", String(k.jobsNotStarted)],
    ["Jobs overdue", String(k.jobsOverdue)],
    ["Jobs on hold", String(k.jobsOnHold)],
    ["Jobs carried forward", String(k.jobsCarriedForward)],
    ["Jobs with material shortages", String(k.materialShortageJobs)],
    ["Planned units", q(k.plannedUnits)],
    ["Actual units", q(k.actualUnits)],
    ["Production achievement", pct(k.achievementPct)],
    [
      "Outstanding production value",
      k.outstandingValue === null ? "Not available" : `${money(k.outstandingValue)}${k.outstandingValueExcludedJobs ? ` (excl. ${k.outstandingValueExcludedJobs} job(s) with no selling price)` : ""}`,
    ],
    ["Production cost (completed)", money(k.productionCost)],
    ["Output value (completed, at selling price)", money(k.outputValue)],
    ["Schedule adherence", pct(k.scheduleAdherencePct)],
    ["On-time completion", pct(k.onTimeCompletionPct)],
    ["First-pass yield", pct(k.firstPassYieldPct)],
    ["Rejected units", k.rejectedUnits === null ? "Not captured" : q(k.rejectedUnits)],
    ["Rework units", k.reworkUnits === null ? "Not captured" : q(k.reworkUnits)],
    ["Downtime (minutes)", k.downtimeMinutes === null ? "Not captured" : q(k.downtimeMinutes)],
  ];
  const sections: Section[] = [
    {
      title: "Exceptions",
      head: ["Exception", "Job", "Product", "Reason", "Recommended action"],
      rows: r.exceptions.map((e) => [e.type, e.jobNumber, e.product, e.reason, e.action]),
    },
    {
      title: "Production schedule",
      head: ["Job", "Finished good", "Item code", "Scheduled", "Required", "Planned", "Actual", "Outstanding", "Status", "Priority", "Area", "Responsible", "Materials"],
      rows: r.jobs.map((j) => [
        `${j.jobNumber}${j.carriedForward ? " (carried fwd)" : ""}`,
        j.product,
        j.itemCode ?? "—",
        `${j.scheduleDate}${j.scheduleSource === "created" ? " (created)" : ""}`,
        j.requiredDate ?? "Not captured",
        q(j.plannedQty),
        j.actualRecorded ? q(j.actualQty) : "Not recorded",
        q(j.outstandingQty),
        `${j.status}${j.overdue ? " — OVERDUE" : ""}`,
        j.priority ?? "—",
        j.area ?? "—",
        j.responsible ?? "—",
        j.materialStatus,
      ]),
    },
    {
      title: "Planned versus actual by product",
      head: ["Finished good", "Item code", "Jobs", "Planned", "Actual", "Remaining", "Variance", "% of target", "Carry-forward"],
      rows: r.products.map((p) => [p.product, p.itemCode ?? "—", p.jobs, q(p.plannedQty), q(p.actualQty), q(p.remainingQty), q(p.variance), pct(p.achievementPct), q(p.carryForwardQty)]),
    },
    {
      title: "Material readiness — shortages and unchecked items",
      head: ["Ingredient / packaging", "Unit", "Required (open jobs)", "On hand", "Short", "On order", "Purchase orders", "Status", "Jobs affected"],
      rows: r.shortages.map((m) => [m.name, m.unit, q(m.required, 4), m.available === null ? "No stock record" : q(m.available, 4), q(m.shortage, 4), q(m.onOrder, 4), m.onOrderRefs.join("; ") || "—", m.status, m.jobs.join(", ")]),
    },
    {
      title: `${r.view === "monthly" ? "Monthly" : r.view === "weekly" ? "Weekly" : "Daily"} summary`,
      head: ["Period", "Jobs", "Completed", "Cancelled", "Planned", "Actual", "% of target", "Production cost"],
      rows: r.buckets.map((b) => [b.label, b.jobs, b.completed, b.cancelled, q(b.plannedQty), q(b.actualQty), pct(b.achievementPct), money(b.productionCost)]),
    },
    {
      title: "Metrics not available",
      head: ["Metric", "Why it is not shown"],
      rows: r.unavailable.map((u) => [u.metric, u.reason]),
    },
  ];
  return { kpis, sections };
}

function periodText(r: ProductionControlReport) {
  return r.from === r.to ? `Production date ${r.from}` : `${r.from} to ${r.to}`;
}

function fileBase(r: ProductionControlReport, company: string) {
  const c = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  return `daily-production-control-${c}-${r.from}${r.from === r.to ? "" : `_${r.to}`}`;
}

export function exportProductionControlPdf(r: ProductionControlReport, company: string, generatedAt: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = 297;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Daily Production Control Report", 12, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${company} · ${periodText(r)} · ${r.view} view`, 12, 19);
  doc.text(`Generated ${new Date(generatedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}`, W - 12, 19, { align: "right" });

  const { kpis, sections } = productionControlSections(r);
  let y = 32;
  if (r.dataNotes.length) {
    doc.setTextColor(120, 53, 15);
    doc.setFontSize(8);
    for (const note of r.dataNotes) {
      const lines = doc.splitTextToSize(`Note: ${note}`, W - 24);
      doc.text(lines, 12, y);
      y += lines.length * 3.6 + 1;
    }
  }
  const half = Math.ceil(kpis.length / 2);
  autoTable(doc, {
    startY: y + 1,
    margin: { left: 12, right: 12 },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
    body: Array.from({ length: half }, (_, i) => [kpis[i]?.[0] ?? "", kpis[i]?.[1] ?? "", kpis[i + half]?.[0] ?? "", kpis[i + half]?.[1] ?? ""]),
  });
  for (const s of sections) {
    let sy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    if (sy > 185) {
      doc.addPage();
      sy = 15;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(s.title, 12, sy);
    autoTable(doc, {
      startY: sy + 2,
      margin: { left: 12, right: 12 },
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 1.3, overflow: "linebreak" },
      head: [s.head],
      body: s.rows.length ? s.rows.map((row) => row.map(String)) : [[`None for ${periodText(r)}.`, ...s.head.slice(1).map(() => "")]],
    });
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Daily Production Control Report · ${company} · ${periodText(r)}`, 12, 204);
    doc.text(`Page ${p} of ${pages}`, W - 12, 204, { align: "right" });
  }
  doc.save(`${fileBase(r, company)}.pdf`);
}

export function exportProductionControlExcel(r: ProductionControlReport, company: string) {
  const wb = XLSX.utils.book_new();
  const { kpis, sections } = productionControlSections(r);
  const summary = [
    ["Daily Production Control Report"],
    ["Company", company],
    ["Period", periodText(r)],
    ["View", r.view],
    [],
    ["Metric", "Value"],
    ...kpis,
    [],
    ["Data notes"],
    ...r.dataNotes.map((n) => [n]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
  for (const s of sections) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.head, ...s.rows]), s.title.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 31));
  }
  // Material requirement per open job (the detail behind the readiness section).
  const materialRows: (string | number)[][] = [["Job", "Finished good", "Ingredient / packaging", "Unit", "Required", "On hand", "Allocated to earlier jobs", "Short", "On order", "Status"]];
  for (const j of r.jobs) for (const m of j.materials || []) materialRows.push([j.jobNumber, j.product, m.name, m.unit, m.required, m.available ?? "No stock record", m.allocatedToEarlierJobs, m.shortage, m.onOrder, m.status]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(materialRows), "Material by job");
  XLSX.writeFile(wb, `${fileBase(r, company)}.xlsx`);
}

export function exportProductionControlCsv(r: ProductionControlReport, company: string) {
  const { kpis, sections } = productionControlSections(r);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [esc("Daily Production Control Report"), `${esc("Company")},${esc(company)}`, `${esc("Period")},${esc(periodText(r))}`, ""];
  for (const [label, value] of kpis) lines.push(`${esc(label)},${esc(value)}`);
  for (const s of sections) {
    lines.push("", esc(s.title), s.head.map(esc).join(","));
    for (const row of s.rows) lines.push(row.map(esc).join(","));
  }
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase(r, company)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
