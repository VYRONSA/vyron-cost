import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreProductionRunsClient from "@/components/vyron-cost/production-planning/StoreProductionRunsClient";

export default function ProductionRunsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Production Runs" subtitle="Store-order-driven production planning runs.">
      <StoreProductionRunsClient />
    </VyronCostAiShell>
  );
}
