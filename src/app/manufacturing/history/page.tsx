import ProductionRunsListClient from "@/components/ProductionRunsListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ProductionHistoryPage() {
  return (
    <VyronCostAiShell title="Manufacturing History" subtitle="Batch number · date · product · quantity · cost · status · created by · supervisor reversals">
      <ProductionRunsListClient title="Manufacturing history" />
    </VyronCostAiShell>
  );
}
