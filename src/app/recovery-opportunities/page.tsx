import RecoveryOpportunitiesClient from "@/components/RecoveryOpportunitiesClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryExecutiveSummary, getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";

export default async function RecoveryOpportunitiesPage() {
  const [opportunities, summary] = await Promise.all([
    getRecoveryOpportunities(),
    getRecoveryExecutiveSummary(),
  ]);

  return (
    <VyronCostAiShell
      title="Recovery Intelligence Centre"
      subtitle="Identify. Action. Recover."
    >
      <RecoveryOpportunitiesClient initialOpportunities={opportunities} summary={summary} />
    </VyronCostAiShell>
  );
}
