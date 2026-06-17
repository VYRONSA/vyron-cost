import PredictiveRiskCentreClient from "@/components/executive/PredictiveRiskCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function PredictiveRiskPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Predictive Risk Centre"
      subtitle="Forecast where the business is likely heading if current trends continue."
    >
      <PredictiveRiskCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
