import ForecastingClient from "@/components/ForecastingClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getForecastSnapshot } from "@/lib/vyron-forecasting-data";

export default async function ForecastingPage() {
  const snapshot = await getForecastSnapshot();
  return (
    <VyronCostShell hidePageHeader title="Forecasting" subtitle="GP, COGS, supplier inflation and margin risk forecast for 30/60/90 days.">
      <ForecastingClient snapshot={snapshot} />
    </VyronCostShell>
  );
}
