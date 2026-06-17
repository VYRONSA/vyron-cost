import RecoveryOpportunitiesClient from "@/components/RecoveryOpportunitiesClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryExecutiveSummary, getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";

export default async function RecoveryPipelinePage() {
  const [opportunities, summary] = await Promise.all([
    getRecoveryOpportunities(),
    getRecoveryExecutiveSummary(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader title="Recovery Pipeline"
      subtitle="Track identified, investigating, in-progress, negotiated and recovered opportunities."
    >
      <RecoveryOpportunitiesClient initialOpportunities={opportunities} summary={summary} />
    </VyronCostAiShell>
  );
}
