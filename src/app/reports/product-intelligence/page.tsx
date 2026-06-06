import VyronCostPageShell from "@/components/vyron-cost/shared/VyronCostPageShell";
import ProductIntelligenceLiveClient from "@/components/ProductIntelligenceLiveClient";

export default function ProductIntelligencePage() {
  return (
    <VyronCostPageShell
      title="Product Intelligence"
      subtitle="Current cost, selling price, GP%, manufacturing cost, monthly sales and margin erosion across the manufacturing to sales chain."
      backHref="/dashboard"
    >
      <ProductIntelligenceLiveClient />
    </VyronCostPageShell>
  );
}
