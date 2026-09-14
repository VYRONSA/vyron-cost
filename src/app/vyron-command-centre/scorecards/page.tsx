import { AutonomousNav, ScorecardsClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export const dynamic = "force-dynamic";

export default async function ScorecardsPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { scorecards } = await getAutonomousBusinessIntelligence(companyId);
  return (
    <VyronCostShell hidePageHeader title="Enterprise Scorecards" subtitle="SUPPLIERS · INVENTORY · PRODUCTION · RECOVERY · FINANCE · MANAGEMENT">
      <AutonomousNav />
      <ScorecardsClient cards={scorecards} />
    </VyronCostShell>
  );
}
