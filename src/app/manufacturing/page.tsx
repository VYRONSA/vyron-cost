import ManufacturingDashboardClient from "@/components/ManufacturingDashboardClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ManufacturingPage() {
  return (
    <VyronCostAiShell title="Manufacturing Dashboard" subtitle="Production output, cost, yield, wastage and finished goods from live batches">
      <ManufacturingDashboardClient />
    </VyronCostAiShell>
  );
}
