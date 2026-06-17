import ScenarioModellingClient from "@/components/enterprise/ScenarioModellingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { runEnterpriseScenario } from "@/lib/vyron-enterprise-scenarios";

export default async function ScenarioModellingPage() {
  const initial = await runEnterpriseScenario({
    supplierPriceIncreasePct: 10,
    packagingIncreasePct: 0,
    salesDecreasePct: 0,
  });
  return (
    <VyronCostShell hidePageHeader title="Scenario Modelling" subtitle="WHAT-IF · GP · RECOVERY · INVENTORY · PRODUCTION">
      <ScenarioModellingClient initial={initial} />
    </VyronCostShell>
  );
}
