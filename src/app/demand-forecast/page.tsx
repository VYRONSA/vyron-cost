import VyronCostAiShell from "@/components/VyronCostAiShell";
import DemandForecastClient from "@/components/vyron-cost/forecasting/DemandForecastClient";
import ProcurementForecastPanel from "@/components/vyron-cost/forecasting/ProcurementForecastPanel";

export default function DemandForecastPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Demand Forecast" subtitle="Product demand from store ordering behaviour">
      <DemandForecastClient />
      <div className="mt-6">
        <ProcurementForecastPanel />
      </div>
    </VyronCostAiShell>
  );
}
