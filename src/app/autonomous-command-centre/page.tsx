import AutonomousCommandCentreClient from "@/components/executive/AutonomousCommandCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function AutonomousCommandCentrePage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Autonomous Command Centre"
      subtitle="Executive intelligence command hub across health, warning, risk, root cause, decisions and actions."
    >
      <AutonomousCommandCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
