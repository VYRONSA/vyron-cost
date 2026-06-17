import { AutonomousNav, KnowledgeClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const { knowledge } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell hidePageHeader title="Enterprise Knowledge Engine" subtitle="SUPPLIER · PRICE · PRODUCTION · INVENTORY · RECOVERY · FINANCE">
      <AutonomousNav />
      <KnowledgeClient entries={knowledge} />
    </VyronCostShell>
  );
}
