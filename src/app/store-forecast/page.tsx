import VyronCostAiShell from "@/components/VyronCostAiShell";
import StoreForecastClient from "@/components/vyron-cost/forecasting/StoreForecastClient";

export default function StoreForecastPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Store Forecast" subtitle="Expected orders, revenue and volume per store">
      <StoreForecastClient />
    </VyronCostAiShell>
  );
}
