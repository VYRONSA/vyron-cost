import { EnterpriseHubClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function EnterprisePlatformPage() {
  const data = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="Enterprise Platform" subtitle="MULTI-COMPANY · GROUP · BENCHMARKING · AI · VYRON SUITE">
      <PlatformNav />
      <EnterpriseHubClient data={data} />
    </VyronCostShell>
  );
}
