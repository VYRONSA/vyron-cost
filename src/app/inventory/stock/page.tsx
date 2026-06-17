import InventoryStockListClient from "@/components/InventoryStockListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; status?: string }>;
}) {
  const params = await searchParams;
  return (
    <VyronCostAiShell hidePageHeader title="Stock Master" subtitle="Add inventory items · opening stock · raw materials · packaging · finished goods">
      <InventoryStockListClient initialEntityType={params.entityType || ""} initialStatus={params.status || ""} />
    </VyronCostAiShell>
  );
}
