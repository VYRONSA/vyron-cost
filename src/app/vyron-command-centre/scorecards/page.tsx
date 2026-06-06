import { AutonomousNav, ScorecardsClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const { scorecards } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Enterprise Scorecards" subtitle="SUPPLIERS · INVENTORY · PRODUCTION · RECOVERY · FINANCE · MANAGEMENT">
      <AutonomousNav />
      <ScorecardsClient cards={scorecards} />
    </VyronCostShell>
  );
}
