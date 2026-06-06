import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import FinishedGoodsClient from "@/components/vyron-cost/inventory/FinishedGoodsClient";
import StockLedgerClient from "@/components/vyron-cost/inventory/StockLedgerClient";
import InventoryIntelligenceDashboardClient from "@/components/InventoryIntelligenceDashboardClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Inventory Intelligence"
      subtitle="Raw materials, finished goods, inventory turns, low stock and negative stock risk across the full procurement → manufacturing → sales workflow."
      backHref="/dashboard"
    >
      <div className="space-y-8">
        <InventoryIntelligenceDashboardClient />
        <FinishedGoodsClient />
        <StockLedgerClient />
      </div>
    </VyronCostPageShell>
  );
}
