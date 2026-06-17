import ClientProposalStudioClient from "@/components/ClientProposalStudioClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLaunchReadinessSnapshot } from "@/lib/vyron-launch-readiness-data";

export default async function ClientProposalStudioPage() {
  const snapshot = await getLaunchReadinessSnapshot();

  return (
    <VyronCostShell hidePageHeader title="Client Proposal Studio"
      subtitle="RECOVERY VALUE · PROPOSAL SUMMARY · CLIENT FOLLOW-UP"
    >
      <ClientProposalStudioClient snapshot={snapshot} />
    </VyronCostShell>
  );
}
