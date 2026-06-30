import VyronCostAiShell from "@/components/VyronCostAiShell";
import DispatchBoardClient from "@/components/vyron-cost/store-ordering/DispatchBoardClient";

export default function StoreOrderDispatchPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Dispatch Board" subtitle="Orders ready for dispatch through to delivery.">
      <DispatchBoardClient />
    </VyronCostAiShell>
  );
}
