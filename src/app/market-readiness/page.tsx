import MarketReadinessDashboardClient from "@/components/MarketReadinessDashboardClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLaunchReadinessSnapshot } from "@/lib/vyron-launch-readiness-data";

export default async function MarketReadinessPage() {
  const snapshot = await getLaunchReadinessSnapshot();

  return (
    <VyronCostShell hidePageHeader title="Market Readiness"
      subtitle="SELLING POSITION · RECOVERY VALUE · CLIENT CONFIDENCE"
    >
      <MarketReadinessDashboardClient snapshot={snapshot} />
    </VyronCostShell>
  );
}
