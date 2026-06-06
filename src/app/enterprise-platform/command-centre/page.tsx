import { GroupCommandCentreClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function GroupCommandCentrePage() {
  const { groupCommandCentre } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Group Executive Command Centre" subtitle="PROCUREMENT · INVENTORY · MFG · RECOVERY · FINANCE · RISK · AI">
      <PlatformNav />
      <GroupCommandCentreClient cc={groupCommandCentre} />
    </VyronCostShell>
  );
}
