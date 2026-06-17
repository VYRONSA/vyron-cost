import BusinessHealthCentreClient from "@/components/executive/BusinessHealthCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function BusinessHealthPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Business Health Centre"
      subtitle="Overall business health score, category risks and executive actions for leadership."
    >
      <BusinessHealthCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
