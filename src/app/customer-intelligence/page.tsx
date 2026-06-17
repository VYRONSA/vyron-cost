import CustomerIntelligenceClient from "@/components/vyron-cost/customers/CustomerIntelligenceClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function Page() {
  return (
    <VyronCostAiShell
      title="Customer Intelligence"
      subtitle="CUSTOMER REVENUE, GROSS PROFIT, BUYING PATTERNS AND PRODUCT PERFORMANCE FROM CUSTOMER INVOICES."
      hidePageHeader
    >
      <CustomerIntelligenceClient />
    </VyronCostAiShell>
  );
}
