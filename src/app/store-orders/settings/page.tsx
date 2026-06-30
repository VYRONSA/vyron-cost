import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreOrderSettingsClient from "@/components/vyron-cost/store-ordering/StoreOrderSettingsClient";

export default function StoreOrderSettingsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Store Order Settings" subtitle="Commercial approval warning thresholds.">
      <StoreOrderSettingsClient />
    </VyronCostAiShell>
  );
}
