import { AutonomousNav, KnowledgeClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { knowledge } = await getAutonomousBusinessIntelligence(companyId);
  return (
    <VyronCostShell hidePageHeader title="Enterprise Knowledge Engine" subtitle="SUPPLIER · PRICE · PRODUCTION · INVENTORY · RECOVERY · FINANCE">
      <AutonomousNav />
      <KnowledgeClient entries={knowledge} />
    </VyronCostShell>
  );
}
