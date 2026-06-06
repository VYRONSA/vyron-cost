import { AutonomousNav, DecisionsClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const { decisions } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Decision Engine" subtitle="SUPPLIER · PRICE · INVENTORY · PRODUCTION · CONTRACT · RECOVERY · WASTE">
      <AutonomousNav />
      <DecisionsClient decisions={decisions} />
    </VyronCostShell>
  );
}
