import ComplianceCentreClient from "@/components/enterprise/ComplianceCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getComplianceDashboard } from "@/lib/vyron-enterprise-platform";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function ComplianceCentrePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const metrics = await getComplianceDashboard(companyId);
  return (
    <VyronCostShell hidePageHeader title="Compliance Centre" subtitle="PO · INVOICE · APPROVAL · SUPPLIER · STOCK · PRODUCTION">
      <ComplianceCentreClient metrics={metrics} />
    </VyronCostShell>
  );
}
