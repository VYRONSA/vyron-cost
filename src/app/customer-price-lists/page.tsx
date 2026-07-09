import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerPriceListsClient from "@/components/customers/CustomerPriceListsClient";

export default function CustomerPriceListsPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Customer Price Lists"
      subtitle="ENTERPRISE PRICING: VERSIONED LISTS, CONTRACT PRICING, CUSTOMER ASSIGNMENTS, AND AUDITABLE PRICE APPLICATION."
    >
      <CustomerPriceListsClient />
    </VyronCostAiShell>
  );
}
