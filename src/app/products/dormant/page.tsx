import VyronCostAiShell from "@/components/VyronCostAiShell";
import DormantProductsClient from "@/components/vyron-cost/products/DormantProductsClient";

export default function DormantProductsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Dormant Products" subtitle="Find products with no sales or stock movement and deactivate them safely">
      <DormantProductsClient />
    </VyronCostAiShell>
  );
}
