import { AutonomousNav, PredictiveRiskClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function PredictiveRiskPage() {
  const { predictiveRisks } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Predictive Risk Models" subtitle="SUPPLIER · INVENTORY · CASH · MARGIN · RECOVERY · COMPLIANCE">
      <AutonomousNav />
      <PredictiveRiskClient risks={predictiveRisks} />
    </VyronCostShell>
  );
}
