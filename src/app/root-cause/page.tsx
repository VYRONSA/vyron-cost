import RootCauseCentreClient from "@/components/executive/RootCauseCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function RootCausePage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Root Cause Centre"
      subtitle="Identify why business problems exist with traceable evidence from operational data."
    >
      <RootCauseCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
