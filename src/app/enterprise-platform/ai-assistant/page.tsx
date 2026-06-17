import { EnterpriseAiClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function EnterpriseAiPage() {
  const { enterpriseAi } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="VYRON Enterprise AI" subtitle="INFLATION · GP · RECOVERY · BRANCHES · EXPLAINABLE">
      <PlatformNav />
      <EnterpriseAiClient presets={enterpriseAi} />
    </VyronCostShell>
  );
}
