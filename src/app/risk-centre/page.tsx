import RiskCentreClient from "@/components/enterprise/RiskCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getRiskCentre } from "@/lib/vyron-enterprise-platform";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function RiskCentrePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const risks = await getRiskCentre(companyId);
  return (
    <VyronCostShell hidePageHeader title="Risk Centre" subtitle="SUPPLIER · INVENTORY · PRODUCTION · LEAKAGE · FRAUD">
      <RiskCentreClient risks={risks} />
    </VyronCostShell>
  );
}
