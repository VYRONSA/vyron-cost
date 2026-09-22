import { EnterpriseHubClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function EnterprisePlatformPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const data = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Enterprise Platform" subtitle="MULTI-COMPANY · GROUP · BENCHMARKING · AI · VOLORA Suite">
      <PlatformNav />
      <EnterpriseHubClient data={data} />
    </VyronCostShell>
  );
}
