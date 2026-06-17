import CostPlansClient from "@/components/CostPlansClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getCostPlans } from "@/lib/vyron-cost-plans-data";

export default async function CostPlansPage() {
  const plans = await getCostPlans();
  return (
    <VyronCostShell hidePageHeader title="Cost Plans" subtitle="Scenario planning for supplier, labour and packaging cost increases.">
      <CostPlansClient initialPlans={plans} />
    </VyronCostShell>
  );
}
