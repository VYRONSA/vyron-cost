import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroFinancialDefaultsClient from "@/components/vyron-cost/integrations/XeroFinancialDefaultsClient";

export default function XeroFinancialDefaultsPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Company Financial Defaults"
      subtitle="Configure company-level default accounts and VAT using the synchronized local chart of accounts."
    >
      <XeroFinancialDefaultsClient />
    </VyronCostAiShell>
  );
}
