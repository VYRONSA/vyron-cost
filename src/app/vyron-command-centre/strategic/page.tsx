import { AutonomousNav, StrategicClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export const dynamic = "force-dynamic";

export default async function StrategicIntelligencePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { strategic } = await getAutonomousBusinessIntelligence(companyId);
  return (
    <VyronCostShell hidePageHeader title="Strategic Intelligence" subtitle="RISKS · OPPORTUNITIES · SAVINGS · LEAKAGE · RECOVERY · PROFIT">
      <AutonomousNav />
      <StrategicClient s={strategic} />
    </VyronCostShell>
  );
}
