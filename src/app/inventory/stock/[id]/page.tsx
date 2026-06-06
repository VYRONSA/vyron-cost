import InventoryStockDetailClient from "@/components/InventoryStockDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function InventoryStockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell title="Stock Item" subtitle="On-hand · valuation · ledger history">
      <InventoryStockDetailClient stockItemId={id} />
    </VyronCostAiShell>
  );
}
