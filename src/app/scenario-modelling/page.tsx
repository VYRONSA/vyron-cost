import ScenarioModellingClient from "@/components/enterprise/ScenarioModellingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { runEnterpriseScenario } from "@/lib/vyron-enterprise-scenarios";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function ScenarioModellingPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const initial = await runEnterpriseScenario(
    { supplierPriceIncreasePct: 10, packagingIncreasePct: 0, salesDecreasePct: 0 },
    companyId
  );
  return (
    <VyronCostShell hidePageHeader title="Scenario Modelling" subtitle="WHAT-IF · GP · RECOVERY · INVENTORY · PRODUCTION">
      <ScenarioModellingClient initial={initial} />
    </VyronCostShell>
  );
}
