import VyronCostAiShell from "@/components/VyronCostAiShell";
import SalesIntelligenceClient from "@/components/vyron-cost/customers/SalesIntelligenceClient";

export default function Page() {
  return (
    <VyronCostAiShell title="Sales Intelligence" subtitle="SALES BY CUSTOMER, PRODUCT, TOP PERFORMERS, INVOICE TRENDS AND MONTHLY SALES.">
      <SalesIntelligenceClient />
    </VyronCostAiShell>
  );
}
