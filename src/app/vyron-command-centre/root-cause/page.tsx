import { AutonomousNav, RootCauseClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function RootCausePage() {
  const { rootCauses } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="AI Root Cause Analysis" subtitle="WHAT · WHY · WHERE · IMPACT · ACTION · CONFIDENCE">
      <AutonomousNav />
      <RootCauseClient causes={rootCauses} />
    </VyronCostShell>
  );
}
