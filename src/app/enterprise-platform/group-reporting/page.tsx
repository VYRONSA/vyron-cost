import { GroupReportingClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function GroupReportingPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { groupReporting } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Group Reporting" subtitle="CONSOLIDATED PROCUREMENT · INVENTORY · MFG · RECOVERY · FINANCE">
      <PlatformNav />
      <GroupReportingClient data={groupReporting} />
    </VyronCostShell>
  );
}
