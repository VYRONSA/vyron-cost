import VyronCostAiShell from "@/components/VyronCostAiShell";
import PurchaseOrderEngineDetailClient from "@/components/vyron-cost/procurement/PurchaseOrderEngineDetailClient";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Purchase Order Detail" subtitle="Lines, receiving and supplier performance">
      <PurchaseOrderEngineDetailClient poId={id} />
    </VyronCostAiShell>
  );
}
