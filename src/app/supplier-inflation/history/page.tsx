import VyronCostAiShell from "@/components/VyronCostAiShell";
import InflationManagementClient from "@/components/vyron-cost/InflationManagementClient";

export default function InflationManagementPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Historical Inflation Management" subtitle="Inflation baseline, impact preview and corrected-cost requirements">
      <InflationManagementClient />
    </VyronCostAiShell>
  );
}
