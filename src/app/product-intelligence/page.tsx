import ProductIntelligenceClient from "@/components/ProductIntelligenceClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function Page() {
  const rows = await getProductIntelligence();

  return (
    <VyronCostAiShell
      title="Product Intelligence"
      subtitle="PRODUCT COST, SELLING PRICE, GROSS PROFIT, MANUFACTURING COST AND MARGIN EROSION VISIBILITY."
      hidePageHeader
    >
      <ProductIntelligenceClient rows={rows} />
    </VyronCostAiShell>
  );
}
