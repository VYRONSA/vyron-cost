import EnterpriseForecastClient from "@/components/enterprise/EnterpriseForecastClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterpriseForecast } from "@/lib/vyron-enterprise-forecasting";

export default async function EnterpriseForecastingPage() {
  const forecast = await getEnterpriseForecast();
  return (
    <VyronCostShell title="Forecasting Engine" subtitle="30 DAYS · 90 DAYS · 12 MONTHS · LIVE DATA">
      <EnterpriseForecastClient forecast={forecast} />
    </VyronCostShell>
  );
}
