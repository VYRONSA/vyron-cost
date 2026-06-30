import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProcurementRequisitionsClient from "@/components/vyron-cost/procurement/ProcurementRequisitionsClient";

export default function ProcurementPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Procurement" subtitle="Requisitions from production and inventory shortages">
      <ProcurementRequisitionsClient />
    </VyronCostAiShell>
  );
}
