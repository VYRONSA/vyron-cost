import RecoveryOpportunitiesClient from "@/components/RecoveryOpportunitiesClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryExecutiveSummary, getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";

export default async function ActionCentrePage() {
  const [opportunities, summary] = await Promise.all([
    getRecoveryOpportunities(),
    getRecoveryExecutiveSummary(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader title="Action Centre"
      subtitle="The highest-value actions VYRON COST recommends right now."
    >
      <RecoveryOpportunitiesClient initialOpportunities={opportunities} summary={summary} />
    </VyronCostAiShell>
  );
}
