import VyronCostAiShell from "@/components/VyronCostAiShell";
import StorePerformanceClient from "@/components/vyron-cost/store-ordering/StorePerformanceClient";

export default function StorePerformancePage() {
  return (
    <VyronCostAiShell hidePageHeader title="Store Performance" subtitle="Rank stores by commercial performance.">
      <StorePerformanceClient />
    </VyronCostAiShell>
  );
}
