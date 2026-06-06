import CustomerPricingImpactClient from "@/components/CustomerPricingImpactClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function CustomerPricingImpactPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Customer Pricing Impact"
      subtitle="SELLING PRICE · CUSTOMER IMPACT · REVENUE RECOVERY"
    >
      <CustomerPricingImpactClient products={products} />
    </VyronCostShell>
  );
}
