import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreOrderEditorClient from "@/components/vyron-cost/store-ordering/StoreOrderEditorClient";

export default function NewStoreOrderPage() {
  return (
    <VyronCostAiShell hidePageHeader title="New Store Order" subtitle="Create a draft store order.">
      <StoreOrderEditorClient />
    </VyronCostAiShell>
  );
}
