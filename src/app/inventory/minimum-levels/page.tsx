import VyronCostAiShell from "@/components/VyronCostAiShell";
import MinimumLevelsClient from "@/components/vyron-cost/inventory/MinimumLevelsClient";

export default function MinimumLevelsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Minimum Stock Levels" subtitle="Company minimum, warning and critical levels per stock item">
      <MinimumLevelsClient />
    </VyronCostAiShell>
  );
}
