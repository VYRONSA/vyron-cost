import InventoryDashboardClient from "@/components/InventoryDashboardClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function InventoryPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Inventory Intelligence" subtitle="Stock master · ledger · valuation · counts">
      <InventoryDashboardClient />
    </VyronCostAiShell>
  );
}
