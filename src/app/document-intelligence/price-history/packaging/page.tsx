import PriceHistoryScreen from "@/components/PriceHistoryScreen";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function PackagingPriceHistoryPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Packaging Price History" subtitle="PACKAGING COST CHANGES FROM APPROVED INVOICES.">
      <PriceHistoryScreen scope="packaging" />
    </VyronCostAiShell>
  );
}
