import { AutonomousNav, OrgPerformanceClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export const dynamic = "force-dynamic";

export default async function OrgPerformancePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { orgPerformance } = await getAutonomousBusinessIntelligence(companyId);
  return (
    <VyronCostShell hidePageHeader title="Organisational Performance" subtitle="BUYER · WAREHOUSE · PRODUCTION · MANAGEMENT · RECOVERY">
      <AutonomousNav />
      <OrgPerformanceClient rows={orgPerformance} />
    </VyronCostShell>
  );
}
