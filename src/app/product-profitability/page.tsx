import ProductProfitabilityCentreClient from "@/components/ProductProfitabilityCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function ProductProfitabilityPage() {
  const rows = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Product Profitability Centre"
      subtitle="GP GAP · TARGET MARGIN · SUGGESTED PRICE · MONTHLY RISK"
    >
      <ProductProfitabilityCentreClient rows={rows} />
    </VyronCostShell>
  );
}
