import { ActionsClient, AutonomousNav } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const { actions } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Executive Action Tracker" subtitle="OWNER · DUE DATE · STATUS · BENEFIT · COMPLETION">
      <AutonomousNav />
      <ActionsClient actions={actions} />
    </VyronCostShell>
  );
}
