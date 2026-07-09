import VyronCostAiShell from "@/components/VyronCostAiShell";
import OpeningStockImportClient from "@/components/customers/OpeningStockImportClient";

export default function OpeningStockImportPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Opening Stock Import"
      subtitle="ENTERPRISE OPENING STOCK LOAD WITH VALIDATION, DUPLICATE CHECKS, ROLLBACK SAFETY, VALUATION, AND LEDGER POSTING."
    >
      <OpeningStockImportClient />
    </VyronCostAiShell>
  );
}
