import ProductionRunDetailClient from "@/components/ProductionRunDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function ProductionRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Production Run" subtitle="BOM requirements · stock · costing · audit trail">
      <ProductionRunDetailClient runId={id} />
    </VyronCostAiShell>
  );
}
