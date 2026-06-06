import { AutonomousNav, OrgPerformanceClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function OrgPerformancePage() {
  const { orgPerformance } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Organisational Performance" subtitle="BUYER · WAREHOUSE · PRODUCTION · MANAGEMENT · RECOVERY">
      <AutonomousNav />
      <OrgPerformanceClient rows={orgPerformance} />
    </VyronCostShell>
  );
}
