import { FoundationClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function PlatformFoundationPage() {
  const { platformFoundation } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Platform Foundation" subtitle="VYRON COST · FINANCE · PAY · CORE · MAINT · FARM">
      <PlatformNav />
      <FoundationClient foundation={platformFoundation} />
    </VyronCostShell>
  );
}
