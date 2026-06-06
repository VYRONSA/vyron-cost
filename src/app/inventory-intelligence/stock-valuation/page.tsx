import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import FinishedGoodsClient from "@/components/vyron-cost/inventory/FinishedGoodsClient";

export default function Page() {
  return (
    <VyronCostPageShell
      title="Stock Valuation"
      subtitle="Raw materials, packaging and finished goods valuation from the stock movement ledger."
      backHref="/dashboard"
    >
      <FinishedGoodsClient />
    </VyronCostPageShell>
  );
}
