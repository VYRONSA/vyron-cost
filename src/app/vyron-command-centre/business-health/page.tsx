import { AutonomousNav, BusinessHealthClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function BusinessHealthPage() {
  const { businessHealth } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Business Health Engine" subtitle="7 COMPONENTS · OVERALL SCORE 0–100">
      <AutonomousNav />
      <BusinessHealthClient health={businessHealth} />
    </VyronCostShell>
  );
}
