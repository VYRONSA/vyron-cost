import InventoryCountReviewClient from "@/components/InventoryCountReviewClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function InventoryCountReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell title="Count Review" subtitle="Variance approval and ledger posting">
      <InventoryCountReviewClient countId={id} />
    </VyronCostAiShell>
  );
}
