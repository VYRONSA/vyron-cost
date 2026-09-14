import { GroupCommandCentreClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function GroupCommandCentrePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { groupCommandCentre } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Group Executive Command Centre" subtitle="PROCUREMENT · INVENTORY · MFG · RECOVERY · FINANCE · RISK · AI">
      <PlatformNav />
      <GroupCommandCentreClient cc={groupCommandCentre} />
    </VyronCostShell>
  );
}
