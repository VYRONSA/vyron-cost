import VyronCostAiShell from "@/components/VyronCostAiShell";
import DashboardPremiumClient from "@/components/DashboardPremiumClient";
import { getServerActiveWorkspace, shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";
import {
  getPhase4RecoveryInsights,
  getProcurementRiskAlerts,
  getSupplierPriceWidgetSummary,
} from "@/lib/vyron-supplier-intelligence-engine";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getWorkspaceDashboardStats } from "@/lib/vyron-workspace-stats";
import { getStoreOrderOperationsStats } from "@/lib/vyron-store-orders";
import { getProductionPlanningStats } from "@/lib/vyron-store-production-planning";
import { getInventoryTransactionDashboardStats } from "@/lib/vyron-inventory-transactions";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement-requisitions";
import { getPurchaseOrderEngineDashboardStats } from "@/lib/vyron-purchase-order-engine";
import { getDemandForecastDashboardStats } from "@/lib/vyron-demand-forecasting";
import { getCostAiInsightDashboardStats } from "@/lib/vyron-cost-ai-insights";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const activeClient = await getServerActiveWorkspace();
  const useDemo = await shouldUseWorkspaceDemoData();
  const tradingName =
    activeClient?.tradingName || activeClient?.companyName || "VYRON COST";
  const title = `${tradingName} Command Centre`;

  if (!useDemo) {
    let stats;
    let storeOrderStats;
    let productionPlanningStats;
    let inventoryStats;
    let procurementStats;
    let purchaseOrderStats;
    let demandForecastStats;
    let costAiInsightStats;
    const companyId = await getWorkspaceCompanyId();
    if (companyId && isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          [stats, storeOrderStats, productionPlanningStats, inventoryStats, procurementStats, purchaseOrderStats, demandForecastStats, costAiInsightStats] =
            await Promise.all([
            getWorkspaceDashboardStats(supabase, companyId, activeClient?.id),
            getStoreOrderOperationsStats(supabase, companyId),
            getProductionPlanningStats(supabase, companyId),
            getInventoryTransactionDashboardStats(supabase, companyId),
            getProcurementDashboardStats(supabase, companyId),
            getPurchaseOrderEngineDashboardStats(supabase, companyId),
            getDemandForecastDashboardStats(supabase, companyId),
            getCostAiInsightDashboardStats(supabase, companyId),
          ]);
        } catch {
          stats = undefined;
          storeOrderStats = undefined;
          productionPlanningStats = undefined;
          inventoryStats = undefined;
          procurementStats = undefined;
          purchaseOrderStats = undefined;
          demandForecastStats = undefined;
          costAiInsightStats = undefined;
        }
      }
    }

    return (
      <VyronCostAiShell hidePageHeader title={title} subtitle="Premium executive command centre for your workspace.">
        <DashboardPremiumClient
          mode="onboarding"
          tradingName={tradingName}
          client={activeClient}
          stats={stats}
          storeOrderStats={storeOrderStats}
          productionPlanningStats={productionPlanningStats}
          inventoryStats={inventoryStats}
          procurementStats={procurementStats}
          purchaseOrderStats={purchaseOrderStats}
          demandForecastStats={demandForecastStats}
          costAiInsightStats={costAiInsightStats}
        />
      </VyronCostAiShell>
    );
  }

  const [widgets, recoveryInsights, risks] = await Promise.all([
    getSupplierPriceWidgetSummary(),
    getPhase4RecoveryInsights(),
    getProcurementRiskAlerts(),
  ]);
  const topRecovery = recoveryInsights[0];

  return (
    <VyronCostAiShell hidePageHeader title={title} subtitle="AI Costing • Recovery Intelligence • Supplier Intelligence • Margin Protection">
      <DashboardPremiumClient
        mode="demo"
        tradingName={tradingName}
        widgets={widgets}
        risks={risks}
        topRecovery={topRecovery}
      />
    </VyronCostAiShell>
  );
}
