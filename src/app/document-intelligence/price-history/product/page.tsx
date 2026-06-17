import PriceHistoryScreen from "@/components/PriceHistoryScreen";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function ProductPriceHistoryPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Product Cost History" subtitle="PRODUCT COST CHANGES FROM APPROVED INVOICES.">
      <PriceHistoryScreen scope="product" />
    </VyronCostAiShell>
  );
}
