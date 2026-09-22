import { EnterpriseAiClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function EnterpriseAiPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { enterpriseAi } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="VOLORA Enterprise AI" subtitle="INFLATION · GP · RECOVERY · BRANCHES · EXPLAINABLE">
      <PlatformNav />
      <EnterpriseAiClient presets={enterpriseAi} />
    </VyronCostShell>
  );
}
