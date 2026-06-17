import SupplierIntelligenceDashboardClient from "@/components/SupplierIntelligenceDashboardClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierIntelligenceRows, formatSupplierSpend } from "@/lib/vyron-supplier-intelligence-data";
import { getSupplierIntelligenceCentreStats } from "@/lib/vyron-supplier-intelligence-centre";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function SupplierIntelligencePage() {
  const companyId = await getWorkspaceCompanyId();
  const [rows, widgets, centreStats] = await Promise.all([
    getSupplierIntelligenceRows(),
    getSupplierPriceWidgetSummary(companyId),
    getSupplierIntelligenceCentreStats(companyId),
  ]);

  return (
    <VyronCostShell hidePageHeader title="Supplier Intelligence Centre"
      subtitle="SPEND · INFLATION · RISK · VARIANCES · PERFORMANCE · OPPORTUNITIES"
    >
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Total Suppliers", centreStats.totalSuppliers, "bg-white"],
          ["Active Suppliers", centreStats.activeSuppliers, "bg-[#A3E635]/10"],
          ["High Risk Suppliers", centreStats.highRiskSuppliers, "bg-red-50"],
          ["Inflation Alerts", centreStats.inflationAlerts, "bg-amber-50"],
          ["Open Variances", centreStats.openVariances, "bg-orange-50"],
          ["Savings Opportunities", formatSupplierSpend(centreStats.savingsOpportunities), "bg-violet-50"],
        ].map(([label, value, bg]) => (
          <div key={String(label)} className={`rounded-[2rem] p-5 shadow-sm ${bg}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-900">{value}</div>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-red-50 p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Highest Increase (month)</div>
          <div className="mt-2 text-xl font-black text-red-800">
            {widgets.highestIncrease
              ? `${widgets.highestIncrease.supplierName} · ${widgets.highestIncrease.percentageChange.toFixed(1)}%`
              : "No increase detected"}
          </div>
          <div className="mt-1 text-xs font-bold text-red-700">{widgets.highestIncrease?.item || "—"}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Price Increases / Decreases</div>
          <div className="mt-2 text-2xl font-black">
            <span className="text-red-600">{widgets.increasesThisMonth}</span>
            <span className="text-slate-400"> / </span>
            <span className="text-[#84CC16]">{widgets.decreasesThisMonth}</span>
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Suppliers With Most Changes</div>
          <div className="mt-2 space-y-2 text-sm font-bold text-slate-700">
            {widgets.suppliersWithMostChanges.slice(0, 3).map((row) => (
              <div key={`${row.supplierId || row.supplierName}`} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>{row.supplierName}</span>
                <span>{row.changes}</span>
              </div>
            ))}
            {!widgets.suppliersWithMostChanges.length ? (
              <div className="rounded-xl bg-slate-50 px-3 py-2">No recent movement</div>
            ) : null}
          </div>
        </div>
      </section>

      <SupplierIntelligenceDashboardClient rows={rows} />
    </VyronCostShell>
  );
}
