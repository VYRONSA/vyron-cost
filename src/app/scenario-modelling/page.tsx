import ScenarioModellingClient from "@/components/enterprise/ScenarioModellingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { runEnterpriseScenario } from "@/lib/vyron-enterprise-scenarios";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";

export default async function ScenarioModellingPage() {
  // The signed-in member's own company; with no verified session the scenario is not run.
  const initial = await runEnterpriseScenario(
    { supplierPriceIncreasePct: 10, packagingIncreasePct: 0, salesDecreasePct: 0 },
    await resolveApiCompanyId()
  );
  return (
    <VyronCostShell hidePageHeader title="Scenario Modelling" subtitle="WHAT-IF · GP · RECOVERY · INVENTORY · PRODUCTION">
      <ScenarioModellingClient initial={initial} />
    </VyronCostShell>
  );
}
