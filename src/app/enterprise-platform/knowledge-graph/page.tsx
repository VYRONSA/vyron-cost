import { KnowledgeGraphClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function KnowledgeGraphPage() {
  const { knowledgeGraph } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Knowledge Graph" subtitle="SUPPLIER → INVOICE → INGREDIENT → RECIPE → PRODUCT → RECOVERY → FINANCE">
      <PlatformNav />
      <KnowledgeGraphClient graph={knowledgeGraph} />
    </VyronCostShell>
  );
}
