import EarlyWarningCentreClient from "@/components/executive/EarlyWarningCentreClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getTenantCostIntelligence } from "@/lib/vyron-tenant-intelligence";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function EarlyWarningPage() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const intelligence = companyId ? await getTenantCostIntelligence(companyId) : null;
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Early Warning Centre"
      subtitle="Detect cost, margin, inventory, supplier, manufacturing, customer and Xero risks before they escalate."
    >
      <EarlyWarningCentreClient intelligence={intelligence} companyName={companyName} />
    </VyronCostAiShell>
  );
}
