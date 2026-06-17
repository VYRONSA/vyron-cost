import DecisionsCentreClient from "@/components/executive/DecisionsCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function DecisionsPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Decisions Centre"
      subtitle="Convert intelligence into executive decisions with traceable recommendations."
    >
      <DecisionsCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
