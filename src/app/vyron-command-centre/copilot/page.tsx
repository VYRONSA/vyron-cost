import { AutonomousNav, CopilotClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const { copilotPresets } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Ask VYRON" subtitle="EXECUTIVE COPILOT · EXPLAINABLE · DATA-DRIVEN">
      <AutonomousNav />
      <CopilotClient presets={copilotPresets} />
    </VyronCostShell>
  );
}
