import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import ManufacturingIntelligenceClient from "@/components/vyron-cost/manufacturing/ManufacturingIntelligenceClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Manufacturing Intelligence"
      subtitle="Production output, batch yield, wastage, actual vs expected cost and manufacturing variance analysis."
      backHref="/dashboard"
    >
      <ManufacturingIntelligenceClient />
    </VyronCostPageShell>
  );
}
