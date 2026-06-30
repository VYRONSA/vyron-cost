import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreProductionRunDetailClient from "@/components/vyron-cost/production-planning/StoreProductionRunDetailClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductionRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Production Run" subtitle="Product lines and ingredient requirements.">
      <StoreProductionRunDetailClient runId={id} />
    </VyronCostAiShell>
  );
}
