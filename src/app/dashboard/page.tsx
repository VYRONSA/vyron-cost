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
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const activeClient = await getServerActiveWorkspace();
  const useDemo = await shouldUseWorkspaceDemoData();
  const tradingName =
    activeClient?.tradingName || activeClient?.companyName || "VYRON COST";
  const title = `${tradingName} Command Centre`;

  if (!useDemo) {
    let stats;
    const companyId = await getWorkspaceCompanyId();
    if (companyId && isSupabaseServiceRoleConfigured()) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          stats = await getWorkspaceDashboardStats(supabase, companyId, activeClient?.id);
        } catch {
          stats = undefined;
        }
      }
    }

    return (
      <VyronCostAiShell hidePageHeader title={title} subtitle="Premium executive command centre for your workspace.">
        <DashboardPremiumClient mode="onboarding" tradingName={tradingName} client={activeClient} stats={stats} />
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
