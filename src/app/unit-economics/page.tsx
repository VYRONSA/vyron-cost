import UnitEconomicsDashboardClient from "@/components/UnitEconomicsDashboardClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function UnitEconomicsPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Unit Economics"
      subtitle="SELLING PRICE · UNIT COST · UNIT PROFIT · GP"
    >
      <UnitEconomicsDashboardClient products={products} />
    </VyronCostShell>
  );
}
