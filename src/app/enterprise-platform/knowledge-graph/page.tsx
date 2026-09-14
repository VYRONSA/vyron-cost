import { KnowledgeGraphClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function KnowledgeGraphPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { knowledgeGraph } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Knowledge Graph" subtitle="SUPPLIER → INVOICE → INGREDIENT → RECIPE → PRODUCT → RECOVERY → FINANCE">
      <PlatformNav />
      <KnowledgeGraphClient graph={knowledgeGraph} />
    </VyronCostShell>
  );
}
