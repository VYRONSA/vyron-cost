import { AutonomousNav, EarlyWarningClient } from "@/components/autonomous/AutonomousIntelligenceClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getAutonomousBusinessIntelligence } from "@/lib/vyron-autonomous-business-intelligence";

export const dynamic = "force-dynamic";

export default async function EarlyWarningPage() {
  const { earlyWarnings } = await getAutonomousBusinessIntelligence();
  return (
    <VyronCostShell title="Executive Early Warning System" subtitle="30 · 90 · 365 DAYS · SUPPLIER · CASH · INVENTORY · PRODUCTION">
      <AutonomousNav />
      <EarlyWarningClient warnings={earlyWarnings} />
    </VyronCostShell>
  );
}
