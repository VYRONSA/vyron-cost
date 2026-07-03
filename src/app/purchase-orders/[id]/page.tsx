import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProcurementPoDetailClient from "@/components/ProcurementPoDetailClient";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Purchase Order Detail" subtitle="Lines, receiving and supplier performance">
      <ProcurementPoDetailClient poId={id} />
    </VyronCostAiShell>
  );
}
