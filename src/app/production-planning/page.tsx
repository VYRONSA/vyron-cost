import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProductionPlanningClient from "@/components/vyron-cost/production-planning/ProductionPlanningClient";

export default function ProductionPlanningPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Production Planning" subtitle="Convert store orders into production requirements.">
      <ProductionPlanningClient />
    </VyronCostAiShell>
  );
}
