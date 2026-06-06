import RecoveryOpportunitiesClient from "@/components/RecoveryOpportunitiesClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryExecutiveSummary, getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";

export default async function RecommendationsPage() {
  const [opportunities, summary] = await Promise.all([
    getRecoveryOpportunities(),
    getRecoveryExecutiveSummary(),
  ]);

  return (
    <VyronCostAiShell
      title="AI Recommendations"
      subtitle="Actionable recovery and margin protection recommendations based on current costing data."
    >
      <RecoveryOpportunitiesClient initialOpportunities={opportunities} summary={summary} />
    </VyronCostAiShell>
  );
}
