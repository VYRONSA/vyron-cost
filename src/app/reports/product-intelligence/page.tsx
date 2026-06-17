import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProductIntelligenceLiveClient from "@/components/ProductIntelligenceLiveClient";

export default function ProductIntelligencePage() {
  return (
    <VyronCostAiShell hidePageHeader title="Product Intelligence"
      subtitle="CURRENT COST, SELLING PRICE, GP%, MANUFACTURING COST, MONTHLY SALES AND MARGIN EROSION ACROSS THE MANUFACTURING TO SALES CHAIN."
    >
      <ProductIntelligenceLiveClient />
    </VyronCostAiShell>
  );
}
