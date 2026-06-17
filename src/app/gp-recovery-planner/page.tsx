import GPRecoveryPlannerClient from "@/components/GPRecoveryPlannerClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function GPRecoveryPlannerPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell hidePageHeader title="GP Recovery Planner"
      subtitle="PRICE RECOVERY · COST RECOVERY · MONTHLY GP PLAN"
    >
      <GPRecoveryPlannerClient products={products} />
    </VyronCostShell>
  );
}
