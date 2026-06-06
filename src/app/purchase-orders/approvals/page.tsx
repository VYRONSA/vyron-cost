import ProcurementPoListClient from "@/components/ProcurementPoListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function PurchaseOrderApprovalsPage() {
  return (
    <VyronCostAiShell title="Purchase Order Approvals" subtitle="Submitted POs awaiting supervisor or manager approval">
      <ProcurementPoListClient initialStatus="Submitted" />
    </VyronCostAiShell>
  );
}
