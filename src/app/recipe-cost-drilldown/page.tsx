import RecipeCostDrilldownClient from "@/components/RecipeCostDrilldownClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function RecipeCostDrilldownPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Recipe Cost Drilldown"
      subtitle="INGREDIENTS · PACKAGING · LABOUR · OVERHEADS"
    >
      <RecipeCostDrilldownClient products={products} />
    </VyronCostShell>
  );
}
