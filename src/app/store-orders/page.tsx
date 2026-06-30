import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreOrdersClient from "@/components/vyron-cost/store-ordering/StoreOrdersClient";

export default function StoreOrdersPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Store Orders" subtitle="Store replenishment orders and fulfilment workflow.">
      <StoreOrdersClient />
    </VyronCostAiShell>
  );
}
