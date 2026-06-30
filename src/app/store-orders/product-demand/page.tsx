import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProductDemandClient from "@/components/vyron-cost/store-ordering/ProductDemandClient";

export default function ProductDemandPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Product Demand" subtitle="Top and bottom ordered finished goods.">
      <ProductDemandClient />
    </VyronCostAiShell>
  );
}
