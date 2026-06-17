import ComplianceCentreClient from "@/components/enterprise/ComplianceCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getComplianceDashboard } from "@/lib/vyron-enterprise-platform";

export default async function ComplianceCentrePage() {
  const metrics = await getComplianceDashboard();
  return (
    <VyronCostShell hidePageHeader title="Compliance Centre" subtitle="PO · INVOICE · APPROVAL · SUPPLIER · STOCK · PRODUCTION">
      <ComplianceCentreClient metrics={metrics} />
    </VyronCostShell>
  );
}
