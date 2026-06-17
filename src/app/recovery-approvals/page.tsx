import RecoveryApprovalsClient from "@/components/RecoveryApprovalsClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getLeakageFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function RecoveryApprovalsPage() {
  const findings = await getLeakageFindings();

  return (
    <VyronCostShell hidePageHeader title="Recovery Approvals"
      subtitle="APPROVE · REJECT · TRACK RECOVERABLE VALUE"
    >
      <RecoveryApprovalsClient findings={findings} />
    </VyronCostShell>
  );
}
