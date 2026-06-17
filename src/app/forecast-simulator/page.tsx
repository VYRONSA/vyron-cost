import ForecastScenarioSimulatorClient from "@/components/ForecastScenarioSimulatorClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getForecastSnapshot } from "@/lib/vyron-forecasting-data";

export default async function ForecastSimulatorPage() {
  const snapshot = await getForecastSnapshot();

  return (
    <VyronCostShell hidePageHeader title="Forecast Scenario Simulator"
      subtitle="WHAT-IF PRICE PRESSURE · GP FORECAST · COGS IMPACT"
    >
      <ForecastScenarioSimulatorClient snapshot={snapshot} />
    </VyronCostShell>
  );
}
