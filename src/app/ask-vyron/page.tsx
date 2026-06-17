import AskVyronClient from "@/components/executive/AskVyronClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function AskVyronPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";
  const hasWorkspace = Boolean(workspace?.id && companyId);

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Ask VYRON"
      subtitle="Ask your business what is happening, why it is happening, and what to do next."
    >
      <AskVyronClient intelligence={intelligence} companyName={companyName} hasWorkspace={hasWorkspace} />
    </VyronCostAiShell>
  );
}
