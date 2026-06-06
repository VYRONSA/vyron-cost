import ProductionVariancesClient from "@/components/ProductionVariancesClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ProductionVariancesPage() {
  return (
    <VyronCostAiShell title="Production Variances" subtitle="Planned vs actual cost · yield · usage">
      <ProductionVariancesClient />
    </VyronCostAiShell>
  );
}
