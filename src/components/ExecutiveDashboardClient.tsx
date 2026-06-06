"use client";

import Link from "next/link";
import { ArrowRight, Banknote, BrainCircuit, Factory, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { FinancialLeakageDashboard } from "@/lib/vyron-leakage-intelligence-data";
import { ForecastSnapshot } from "@/lib/vyron-forecasting-data";
import {
  type RecoveryAuditSummaryRow,
  type RecoveryOpportunity,
} from "@/lib/vyron-cost-recovery-data";
import { type SupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { type SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-data";
import { type ProcurementExecutiveStats, procurementMoney } from "@/lib/vyron-procurement-ai-data";

type RecoveryTrackingStats = {
  potentialRecovery: number;
  recoveredRecovery: number;
  recoverySuccessPct: number;
  openOpportunities: number;
  recoveredThisMonth: number;
  recoveredThisYear: number;
  funnel: Array<{ status: string; count: number }>;
  topRecoveryCategories: Array<{ category: string; value: number }>;
  topRecoveryOwners: Array<{ owner: string; value: number }>;
};

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ExecutiveDashboardClient({
  products,
  leakage,
  forecast,
  recoveryStats,
  opportunities,
  supplierWidgets,
  supplierRows,
  auditSummary,
  procurementStats,
  inventoryStats,
  manufacturingStats,
}: {
  products: ProductIntelligenceRow[];
  leakage: FinancialLeakageDashboard;
  forecast: ForecastSnapshot;
  recoveryStats: RecoveryTrackingStats;
  opportunities: RecoveryOpportunity[];
  supplierWidgets: SupplierPriceWidgetSummary;
  supplierRows: SupplierIntelRow[];
  auditSummary: RecoveryAuditSummaryRow[];
  procurementStats: ProcurementExecutiveStats;
  inventoryStats: {
    inventoryValue: number;
    lowStock: number;
    slowMoving: number;
    inventoryVariance: number;
    stockTurnover: number;
  } | null;
  manufacturingStats: {
    productionCost: number;
    yieldPct: number;
    wastagePct: number;
    finishedGoodsValue: number;
    productionVariances: number;
    productionEfficiency: number;
  } | null;
}) {
  const productRisk = products.reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
  const belowTarget = products.filter((row) => Number(row.gp_gap || 0) > 0).length;
  const recovery = Number(recoveryStats.potentialRecovery || 0);
  const annualRecovery = Number(recoveryStats.recoveredThisYear || 0);
  const forecast90 = forecast.cards.find((card) => card.horizon === "90") || forecast.cards[forecast.cards.length - 1];

  const cards: Array<{ label: string; value: string; note: string; Icon: LucideIcon; colour: string }> = [
    { label: "Monthly Leakage", value: money(leakage.estimatedMonthlyLeakage), note: "Detected leakage exposure", Icon: ShieldAlert, colour: "text-red-700" },
    { label: "Potential Recovery", value: money(recovery), note: "Identify. Action. Recover.", Icon: Banknote, colour: "text-emerald-700" },
    { label: "Recovered This Year", value: money(annualRecovery), note: "Tracked recovered value", Icon: TrendingUp, colour: "text-violet-700" },
    { label: "Open Opportunities", value: String(recoveryStats.openOpportunities), note: "Recovery tracking lifecycle", Icon: Factory, colour: "text-amber-600" },
  ];

  const highRiskOpenItems = opportunities.filter(
    (item) =>
      !["Recovered", "Rejected", "Ignored"].includes(item.tracking_status || item.status || "New") &&
      (Number(item.confidence || 0) < 65 || Boolean(item.missing_inputs?.length))
  );
  const recoveredItems = opportunities.filter((item) => (item.tracking_status || item.status) === "Recovered");

  function drawSectionTitle(doc: jsPDF, title: string, y: number) {
    doc.setFillColor(91, 33, 182);
    doc.roundedRect(14, y - 6, 182, 10, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(title, 18, y);
    doc.setTextColor(15, 23, 42);
  }

  function exportBoardPackPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const generated = new Date();
    let y = 18;

    // Cover page
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("VYRON COST", 14, 30);
    doc.setFontSize(16);
    doc.text("Recovery Intelligence Board Pack", 14, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Company: Handcrafted Food Products", 14, 56);
    doc.text("Date Range: Current month to date", 14, 63);
    doc.text(`Generated: ${generated.toLocaleString()}`, 14, 70);

    doc.addPage();
    y = 14;

    // 1. Executive Summary
    drawSectionTitle(doc, "1. Executive Summary", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [67, 56, 202] },
      head: [["Metric", "Value"]],
      body: [
        ["Potential Recovery", money(recoveryStats.potentialRecovery)],
        ["Verified Recovery", money(recoveryStats.recoveredRecovery)],
        ["Estimated Recovery", money(recoveryStats.potentialRecovery - recoveryStats.recoveredRecovery)],
        ["Recovered To Date", money(recoveryStats.recoveredRecovery)],
        ["Open Opportunities", String(recoveryStats.openOpportunities)],
        ["Recovery Success %", `${recoveryStats.recoverySuccessPct.toFixed(1)}%`],
        ["High Risk Items", String(highRiskOpenItems.length)],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 2. Recovery Funnel
    drawSectionTitle(doc, "2. Recovery Funnel", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      head: [["Status", "Count"]],
      body: recoveryStats.funnel.map((f) => [f.status, String(f.count)]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 3. Top Recovery Categories
    drawSectionTitle(doc, "3. Top Recovery Categories", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
      head: [["Category", "Recovered Value"]],
      body:
        recoveryStats.topRecoveryCategories.length > 0
          ? recoveryStats.topRecoveryCategories.map((row) => [row.category, money(row.value)])
          : [["No category data available", "—"]],
    });

    doc.addPage();
    y = 14;

    // 4. Top Opportunities
    drawSectionTitle(doc, "4. Top Opportunities", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [67, 56, 202] },
      head: [[
        "Opportunity",
        "Category",
        "Potential",
        "Actual",
        "Status",
        "Owner",
        "Due Date",
        "Confidence",
      ]],
      body:
        opportunities.length > 0
          ? opportunities.slice(0, 12).map((item) => [
              item.title,
              item.opportunity_type,
              money(item.potential_recovery || item.monthly_value),
              money(item.actual_recovery || item.recovered_to_date),
              item.tracking_status || item.status || "New",
              item.owner_name || "Unassigned",
              item.due_date || "—",
              `${Number(item.confidence || 0).toFixed(0)}%`,
            ])
          : [["No opportunities available", "", "", "", "", "", "", ""]],
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 5. Recovered Items
    drawSectionTitle(doc, "5. Recovered Items", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
      head: [["Title", "Recovered Amount", "Recovery Date", "Method", "Evidence Summary"]],
      body:
        recoveredItems.length > 0
          ? recoveredItems.slice(0, 10).map((item) => [
              item.title,
              money(item.actual_recovery || item.recovered_to_date),
              item.recovery_date || "—",
              item.recovery_method || "—",
              item.recovery_evidence || "—",
            ])
          : [["No recovered items yet", "", "", "", ""]],
    });

    doc.addPage();
    y = 14;

    // 6. High Risk Open Items
    drawSectionTitle(doc, "6. High Risk Open Items", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
      head: [["Opportunity", "Risk Level", "Missing Inputs", "Confidence", "Recommended Action"]],
      body:
        highRiskOpenItems.length > 0
          ? highRiskOpenItems.slice(0, 12).map((item) => [
              item.title,
              Number(item.confidence || 0) < 65 ? "High" : "Medium",
              item.missing_inputs?.join(", ") || "—",
              `${Number(item.confidence || 0).toFixed(0)}%`,
              item.recommended_action || "Review and action",
            ])
          : [["No high risk open items", "", "", "", ""]],
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 7. Supplier Intelligence Summary
    drawSectionTitle(doc, "7. Supplier Intelligence Summary", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      head: [["Supplier Metric", "Value"]],
      body: [
        ["Highest Increase", supplierWidgets.highestIncrease ? `${supplierWidgets.highestIncrease.supplierName} (${supplierWidgets.highestIncrease.percentageChange.toFixed(2)}%)` : "No data"],
        ["Highest Decrease", supplierWidgets.highestDecrease ? `${supplierWidgets.highestDecrease.supplierName} (${supplierWidgets.highestDecrease.percentageChange.toFixed(2)}%)` : "No data"],
        ["Suppliers With Most Changes", String(supplierWidgets.suppliersWithMostChanges.length)],
        ["Risky Suppliers", String(supplierRows.filter((row) => Number(row.supplier_risk_score || 0) >= 75).length)],
        ["Price Increases This Month", String(supplierWidgets.increasesThisMonth)],
        ["Price Decreases This Month", String(supplierWidgets.decreasesThisMonth)],
      ],
    });

    doc.addPage();
    y = 14;

    // 8. Management Actions
    drawSectionTitle(doc, "8. Management Actions", y);
    y += 8;
    const actionList = [
      "Review supplier pricing where movement exceeds threshold.",
      "Approve selling price updates for margin erosion products.",
      "Recover duplicate invoice exposures before payment.",
      "Approve packaging price adjustments with clear evidence.",
      "Investigate unexplained procurement variance and missing PO links.",
    ];
    autoTable(doc, {
      startY: y,
      theme: "plain",
      styles: { fontSize: 9 },
      body: actionList.map((action) => [`• ${action}`]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // 9. Audit Trail Summary
    drawSectionTitle(doc, "9. Audit Trail Summary", y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [67, 56, 202] },
      head: [["When", "Opportunity", "Changed By", "Field", "Old", "New"]],
      body:
        auditSummary.length > 0
          ? auditSummary.slice(0, 14).map((row) => [
              new Date(row.changed_at).toLocaleString(),
              row.opportunity_key,
              row.changed_by || "Unknown",
              row.field_name,
              row.old_value || "—",
              row.new_value || "—",
            ])
          : [["No audit events captured yet", "", "", "", "", ""]],
    });

    doc.save(`vyron-recovery-board-pack-${generated.toISOString().slice(0, 10)}.pdf`);
  }

  function exportRecoveryCsv() {
    const headers = [
      "Opportunity Title",
      "Category",
      "Potential Recovery",
      "Actual Recovery",
      "Status",
      "Owner",
      "Due Date",
      "Confidence",
      "Missing Inputs",
    ];
    const rows = opportunities.map((item) => [
      item.title,
      item.opportunity_type,
      String(item.potential_recovery || item.monthly_value || 0),
      String(item.actual_recovery || item.recovered_to_date || 0),
      item.tracking_status || item.status || "New",
      item.owner_name || "Unassigned",
      item.due_date || "",
      `${Number(item.confidence || 0).toFixed(0)}%`,
      item.missing_inputs?.join("; ") || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? "");
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyron-recovery-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="grid gap-6">
      <section className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Executive Reporting</div>
            <div className="mt-1 text-lg font-black text-[#07110d]">Board-ready exports from live recovery data</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportBoardPackPdf}
              className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-700 px-4 py-3 text-sm font-black text-white"
            >
              Export Executive Board Pack
            </button>
            <button
              type="button"
              onClick={exportRecoveryCsv}
              className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700"
            >
              Export Recovery CSV
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        {cards.map(({ label, value, note, Icon, colour }) => (
          <div key={label} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
            <Icon className={colour} size={28} />
            <div className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
            <div className={`mt-3 text-4xl font-black ${colour}`}>{value}</div>
            <p className="mt-2 text-sm font-bold text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-2xl font-black text-[#07110d]">Owner Summary</h2>
          <div className="mt-5 grid gap-4">
            <div className="rounded-3xl bg-red-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Problem</div>
              <p className="mt-2 text-sm font-bold leading-7 text-red-950">
                VYRON has detected {money(leakage.estimatedMonthlyLeakage)} monthly leakage exposure and {belowTarget} products below target GP.
              </p>
            </div>
            <div className="rounded-3xl bg-emerald-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Opportunity</div>
              <p className="mt-2 text-sm font-bold leading-7 text-emerald-950">
                Potential recovery is {money(recoveryStats.potentialRecovery)} with {money(recoveryStats.recoveredRecovery)} already recovered.
              </p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Forecast</div>
              <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                90-day GP forecast is {forecast90?.gpForecast ?? 0}% with {forecast90?.marginRiskCount ?? 0} products at margin risk.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <BrainCircuit size={34} className="text-emerald-300" />
          <h2 className="mt-6 text-3xl font-black">Demo Close Path</h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
            Show the prospect the Executive Dashboard, then click into Recovery and Product Profitability.
          </p>
          <div className="mt-7 grid gap-3">
            <Link href="/financial-leakage" className="inline-flex items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#07110d]">
              Explain recovery <ArrowRight size={17} />
            </Link>
            <Link href="/product-profitability" className="inline-flex items-center justify-between rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-[#07110d]">
              Open profitability <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] xl:col-span-2">
          <h3 className="text-xl font-black text-[#07110d]">Recovery Funnel</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">New → Under Review → Accepted → Actioned → Recovered</p>
          <div className="mt-4 grid grid-cols-5 gap-3">
            {recoveryStats.funnel.map((step) => (
              <div key={step.status} className="rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{step.status}</div>
                <div className="mt-2 text-2xl font-black text-violet-700">{step.count}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-xl font-black text-[#07110d]">Recovery Performance</h3>
          <div className="mt-4 space-y-2 text-sm font-bold text-slate-600">
            <div className="rounded-xl bg-slate-50 px-3 py-2">Recovery Success: {recoveryStats.recoverySuccessPct.toFixed(1)}%</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">Recovered This Month: {money(recoveryStats.recoveredThisMonth)}</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">Recovered This Year: {money(recoveryStats.recoveredThisYear)}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-gradient-to-r from-indigo-700 to-violet-800 p-6 text-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-200">
              <Sparkles size={16} /> AI Procurement Manager
            </div>
            <h3 className="mt-2 text-2xl font-black">Procurement action layer</h3>
            <p className="mt-2 text-sm font-semibold text-indigo-100">See it. Understand it. Fix it.</p>
          </div>
          <Link
            href="/ai-procurement-manager"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-indigo-900"
          >
            Open command centre <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200">Procurement health</div>
            <div className="mt-2 text-3xl font-black">{procurementStats.healthScore.overall}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200">Open recommendations</div>
            <div className="mt-2 text-3xl font-black">{procurementStats.openRecommendations}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200">Implemented</div>
            <div className="mt-2 text-3xl font-black">{procurementStats.implementedRecommendations}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200">Potential savings</div>
            <div className="mt-2 text-2xl font-black">{procurementMoney(procurementStats.potentialSavingsAnnual)}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-200">Realized savings</div>
            <div className="mt-2 text-2xl font-black">{procurementMoney(procurementStats.realizedSavingsAnnual)}</div>
          </div>
        </div>
      </section>

      {manufacturingStats ? (
        <section className="rounded-[2rem] bg-violet-950 p-6 text-white shadow-[0_18px_55px_rgba(76,29,149,0.24)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">Manufacturing Intelligence</div>
              <h3 className="mt-2 text-2xl font-black">Production cost · yield · finished goods</h3>
            </div>
            <Link href="/manufacturing" className="rounded-2xl bg-violet-400 px-5 py-3 text-sm font-black text-violet-950">
              Open production →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-violet-200">Production cost (MTD)</div>
              <div className="mt-2 text-2xl font-black">{money(manufacturingStats.productionCost)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-violet-200">Yield %</div>
              <div className="mt-2 text-3xl font-black">{manufacturingStats.yieldPct}%</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-violet-200">Wastage %</div>
              <div className="mt-2 text-3xl font-black">{manufacturingStats.wastagePct}%</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-violet-200">Finished goods value</div>
              <div className="mt-2 text-2xl font-black">{money(manufacturingStats.finishedGoodsValue)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-violet-200">Variances · efficiency</div>
              <div className="mt-2 text-xl font-black">
                {manufacturingStats.productionVariances} · {manufacturingStats.productionEfficiency}%
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {inventoryStats ? (
        <section className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Inventory Intelligence</div>
              <h3 className="mt-2 text-2xl font-black">Weighted average valuation · live ledger</h3>
            </div>
            <Link href="/inventory" className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-[#07110d]">
              Open inventory →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-200">Inventory value</div>
              <div className="mt-2 text-2xl font-black">{money(inventoryStats.inventoryValue)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-200">Low stock</div>
              <div className="mt-2 text-3xl font-black">{inventoryStats.lowStock}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-200">Slow moving</div>
              <div className="mt-2 text-3xl font-black">{inventoryStats.slowMoving}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-200">Count variance</div>
              <div className="mt-2 text-2xl font-black">{money(inventoryStats.inventoryVariance)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-200">Turnover (90d)</div>
              <div className="mt-2 text-3xl font-black">{inventoryStats.stockTurnover}x</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-xl font-black text-[#07110d]">Top Recovery Categories</h3>
          <div className="mt-3 space-y-2">
            {recoveryStats.topRecoveryCategories.map((row) => (
              <div key={row.category} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <span>{row.category}</span>
                <span>{money(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-xl font-black text-[#07110d]">Top Recovery Owners</h3>
          <div className="mt-3 space-y-2">
            {recoveryStats.topRecoveryOwners.map((row) => (
              <div key={row.owner} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <span>{row.owner}</span>
                <span>{money(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
