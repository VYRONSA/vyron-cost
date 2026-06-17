import ProcurementPoDetailClient from "@/components/ProcurementPoDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Purchase Order Detail" subtitle="Lines, receipts, matching and approvals">
      <ProcurementPoDetailClient poId={id} />
    </VyronCostAiShell>
  );
}
