import { AutonomousNav, StrategicClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function StrategicIntelligencePage() {
  const { strategic } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Strategic Intelligence" subtitle="RISKS · OPPORTUNITIES · SAVINGS · LEAKAGE · RECOVERY · PROFIT">
      <AutonomousNav />
      <StrategicClient s={strategic} />
    </VyronCostShell>
  );
}
