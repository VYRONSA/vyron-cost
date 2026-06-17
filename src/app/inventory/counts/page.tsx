import InventoryCountsClient from "@/components/InventoryCountsClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function InventoryCountsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Stock Counts" subtitle="Draft → submit → approve → post variances">
      <InventoryCountsClient />
    </VyronCostAiShell>
  );
}
