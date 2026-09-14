import { FoundationClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function PlatformFoundationPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { platformFoundation } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Platform Foundation" subtitle="VYRON COST · FINANCE · PAY · CORE · MAINT · FARM">
      <PlatformNav />
      <FoundationClient foundation={platformFoundation} />
    </VyronCostShell>
  );
}
