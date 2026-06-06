import PriceHistoryScreen from "@/components/PriceHistoryScreen";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function SupplierPriceHistoryPage() {
  return (
    <VyronCostAiShell title="Supplier Price History" subtitle="PRICE MOVEMENTS BY SUPPLIER INVOICE.">
      <PriceHistoryScreen scope="supplier" />
    </VyronCostAiShell>
  );
}
