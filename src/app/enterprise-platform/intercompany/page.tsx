import { IntercompanyClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function IntercompanyPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { intercompany } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Intercompany Intelligence" subtitle="PURCHASES · TRANSFERS · INVENTORY · RECOVERIES">
      <PlatformNav />
      <IntercompanyClient rows={intercompany} />
    </VyronCostShell>
  );
}
