import ExecutiveCommandCentreClient from "@/components/ExecutiveCommandCentreClient";
import ExecutiveDashboardClient from "@/components/ExecutiveDashboardClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getForecastSnapshot } from "@/lib/vyron-forecasting-data";
import { getFinancialLeakageDashboard } from "@/lib/vyron-leakage-intelligence-data";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import {
  getRecoveryAuditSummary,
  getRecoveryOpportunities,
  getRecoveryTrackingExecutiveStats,
} from "@/lib/vyron-cost-recovery-data";
import { getInventoryExecutiveStats } from "@/lib/vyron-inventory";
import { getManufacturingExecutiveStats } from "@/lib/vyron-manufacturing";
import { getProcurementExecutiveStats } from "@/lib/vyron-procurement-ai-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function ExecutiveDashboardPage() {
  const companyId = (await getWorkspaceCompanyId()) || undefined;
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const inventoryPromise = supabase && companyId
    ? getInventoryExecutiveStats(supabase, companyId).catch(() => ({
        inventoryValue: 0,
        lowStock: 0,
        slowMoving: 0,
        inventoryVariance: 0,
        stockTurnover: 0,
      }))
    : Promise.resolve(null);

  const manufacturingPromise = supabase && companyId
    ? getManufacturingExecutiveStats(supabase, companyId).catch(() => ({
        productionCost: 0,
        yieldPct: 0,
        wastagePct: 0,
        finishedGoodsValue: 0,
        productionVariances: 0,
        productionEfficiency: 0,
      }))
    : Promise.resolve(null);

  const commandCentrePromise = companyId
    ? getExecutiveCommandCentreData(supabase, companyId)
    : Promise.resolve(null);

  const [
    commandCentre,
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
  ] = await Promise.all([
    commandCentrePromise,
    getProductIntelligence(),
    getFinancialLeakageDashboard(),
    getForecastSnapshot(),
    getRecoveryTrackingExecutiveStats(),
    getRecoveryOpportunities(),
    getSupplierPriceWidgetSummary(),
    getSupplierIntelligenceRows(),
    getRecoveryAuditSummary(25),
    getProcurementExecutiveStats(),
    inventoryPromise,
    manufacturingPromise,
  ]);

  return (
    <VyronCostShell hidePageHeader title="Executive Dashboard"
      subtitle="CEO / CFO COMMAND CENTRE · AI INTELLIGENCE · RECOVERY"
    >
      <div className="grid gap-10">
        {commandCentre ? <ExecutiveCommandCentreClient data={commandCentre} /> : null}
        <details className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-700">Board pack & recovery drill-down</summary>
          <div className="mt-4 border-t border-slate-100 pt-6">
            <ExecutiveDashboardClient
              products={products}
              leakage={leakage}
              forecast={forecast}
              recoveryStats={recoveryStats}
              opportunities={opportunities}
              supplierWidgets={supplierWidgets}
              supplierRows={supplierRows}
              auditSummary={auditSummary}
              procurementStats={procurementStats}
              inventoryStats={inventoryStats}
              manufacturingStats={manufacturingStats}
            />
          </div>
        </details>
      </div>
    </VyronCostShell>
  );
}
