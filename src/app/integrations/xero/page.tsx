import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroIntegrationClient from "@/components/vyron-cost/integrations/XeroIntegrationClient";

export default function Page() {
  return (
    <VyronCostAiShell
      title="Xero Integration"
      subtitle="CONNECT VYRON COST TO XERO ACCOUNTING FOR CUSTOMERS, SUPPLIERS, INVOICES, BILLS, PURCHASE ORDERS AND ITEMS."
    >
      <XeroIntegrationClient />
    </VyronCostAiShell>
  );
}
