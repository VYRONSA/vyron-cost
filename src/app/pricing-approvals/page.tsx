import PricingApprovalCentreClient from "@/components/PricingApprovalCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function PricingApprovalsPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell hidePageHeader title="Pricing Approvals"
      subtitle="SUGGESTED PRICE · GP PROTECTION · MONTHLY IMPACT"
    >
      <PricingApprovalCentreClient products={products} />
    </VyronCostShell>
  );
}
