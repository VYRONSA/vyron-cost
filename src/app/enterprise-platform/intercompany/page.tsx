import { IntercompanyClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function IntercompanyPage() {
  const { intercompany } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="Intercompany Intelligence" subtitle="PURCHASES · TRANSFERS · INVENTORY · RECOVERIES">
      <PlatformNav />
      <IntercompanyClient rows={intercompany} />
    </VyronCostShell>
  );
}
