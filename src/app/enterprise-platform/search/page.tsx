import { EnterpriseSearchClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";

export default function EnterpriseSearchPage() {
  return (
    <VyronCostShell hidePageHeader title="Enterprise Search" subtitle="INVOICES · PO · GRN · SUPPLIERS · INVENTORY · RECOVERY · FINANCIALS">
      <PlatformNav />
      <EnterpriseSearchClient />
    </VyronCostShell>
  );
}
