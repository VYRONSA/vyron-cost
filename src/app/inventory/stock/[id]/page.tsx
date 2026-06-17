import EditRouteGuard from "@/components/EditRouteGuard";
import InventoryStockDetailClient from "@/components/InventoryStockDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function InventoryStockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Stock Item" subtitle="On-hand · valuation · ledger history">
      <EditRouteGuard permission="view_inventory">
        <InventoryStockDetailClient stockItemId={id} />
      </EditRouteGuard>
    </VyronCostAiShell>
  );
}
