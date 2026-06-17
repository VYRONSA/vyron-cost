import ExecutionCentreClient from "@/components/executive/ExecutionCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function ExecutionCentrePage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";
  const hasWorkspace = Boolean(workspace?.id && companyId);

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Execution Centre"
      subtitle="Execute approved intelligence actions with human oversight."
    >
      <ExecutionCentreClient intelligence={intelligence} companyName={companyName} hasWorkspace={hasWorkspace} />
    </VyronCostAiShell>
  );
}
