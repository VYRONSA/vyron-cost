import ExecutiveBoardroomClient from "@/components/executive/ExecutiveBoardroomClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function ExecutiveBoardroomPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell hidePageHeader title="Executive Boardroom"
      subtitle="Board-level cost, stock, procurement, manufacturing, margin and recovery summary."
    >
      <ExecutiveBoardroomClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
