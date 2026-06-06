import InventoryAlertsClient from "@/components/InventoryAlertsClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function InventoryAlertsPage() {
  return (
    <VyronCostAiShell title="Inventory Alerts" subtitle="Low stock · slow moving · overstock">
      <InventoryAlertsClient />
    </VyronCostAiShell>
  );
}
