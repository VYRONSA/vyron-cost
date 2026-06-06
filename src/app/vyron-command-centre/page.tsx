import { AutonomousNav, CommandCentreClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function VyronCommandCentrePage() {
  const data = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="VYRON Command Centre" subtitle="PROCUREMENT · INVENTORY · MFG · RECOVERY · FINANCE · RISK · COMPLIANCE · FORECAST">
      <AutonomousNav />
      <CommandCentreClient data={data} />
    </VyronCostShell>
  );
}
