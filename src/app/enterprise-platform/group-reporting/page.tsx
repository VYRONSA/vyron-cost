import { GroupReportingClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function GroupReportingPage() {
  const { groupReporting } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="Group Reporting" subtitle="CONSOLIDATED PROCUREMENT · INVENTORY · MFG · RECOVERY · FINANCE">
      <PlatformNav />
      <GroupReportingClient data={groupReporting} />
    </VyronCostShell>
  );
}
