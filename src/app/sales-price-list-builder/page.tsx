import SalesPriceListBuilderClient from "@/components/SalesPriceListBuilderClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function SalesPriceListBuilderPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell hidePageHeader title="Sales Price List Builder"
      subtitle="CUSTOMER PRICE LISTS · SUGGESTED PRICES · GP PROTECTION"
    >
      <SalesPriceListBuilderClient products={products} />
    </VyronCostShell>
  );
}
