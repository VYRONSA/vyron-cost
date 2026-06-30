import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProcurementRequisitionDetailClient from "@/components/vyron-cost/procurement/ProcurementRequisitionDetailClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProcurementDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Requisition Detail" subtitle="Ingredient shortages and supplier intelligence">
      <ProcurementRequisitionDetailClient requisitionId={id} />
    </VyronCostAiShell>
  );
}
