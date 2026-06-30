import VyronCostAiShell from "@/components/VyronCostAiShell";
import PickingQueueClient from "@/components/vyron-cost/store-ordering/PickingQueueClient";

export default function StoreOrderPickingPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Picking Queue" subtitle="Approved orders ready for warehouse picking.">
      <PickingQueueClient />
    </VyronCostAiShell>
  );
}
