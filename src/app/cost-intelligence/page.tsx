import CostIntelligenceCentreClient from "@/components/vyron-cost/intelligence/CostIntelligenceCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function CostIntelligencePage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Cost Intelligence Centre"
      subtitle="Analyse true product cost, margin pressure, supplier inflation and BOM movement."
    >
      <CostIntelligenceCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
