import VyronCostAiShell from "@/components/VyronCostAiShell";
import PriceListImportClient from "@/components/customers/PriceListImportClient";

export default function PriceListImportPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Price List Import"
      subtitle="BULK PRICE LIST ONBOARDING WITH VALIDATION, DUPLICATE DETECTION, ROLLBACK, AND AUDIT TRAILS."
    >
      <PriceListImportClient />
    </VyronCostAiShell>
  );
}
