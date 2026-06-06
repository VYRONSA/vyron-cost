import ContractPriceReviewClient from "@/components/ContractPriceReviewClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";

export default async function ContractPriceReviewPage() {
  const suppliers = await getSupplierIntelligenceRows();

  return (
    <VyronCostShell
      title="Contract Price Review"
      subtitle="SUPPLIER CONTRACTS · PRICE VARIANCE · RENEWAL RISK"
    >
      <ContractPriceReviewClient suppliers={suppliers} />
    </VyronCostShell>
  );
}
