import VyronCostAiShell from "@/components/VyronCostAiShell";
import PurchaseOrdersEngineClient from "@/components/vyron-cost/procurement/PurchaseOrdersEngineClient";

export default function PurchaseOrdersPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Purchase Orders" subtitle="Requisition-driven POs with inventory receiving">
      <PurchaseOrdersEngineClient />
    </VyronCostAiShell>
  );
}
