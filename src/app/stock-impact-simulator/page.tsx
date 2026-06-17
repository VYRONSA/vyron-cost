import StockImpactSimulatorClient from "@/components/StockImpactSimulatorClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function StockImpactSimulatorPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell hidePageHeader title="Stock Impact Simulator"
      subtitle="WASTAGE · STOCK VARIANCE · ANNUAL PROFIT IMPACT"
    >
      <StockImpactSimulatorClient products={products} />
    </VyronCostShell>
  );
}
