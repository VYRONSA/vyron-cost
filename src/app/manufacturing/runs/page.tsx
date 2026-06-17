import ProductionRunsListClient from "@/components/ProductionRunsListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ProductionRunsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Production Runs" subtitle="Live production batches linked to inventory ledger and finished goods">
      <ProductionRunsListClient title="Production runs" />
    </VyronCostAiShell>
  );
}
