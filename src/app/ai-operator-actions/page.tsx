import AiOperatorActionsClient from "@/components/AiOperatorActionsClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function AiOperatorActionsPage() {
  return (
    <VyronCostShell hidePageHeader title="AI Operator Actions"
      subtitle="CREATE · REVIEW · EXPLAIN · PROCESS · PLAN"
    >
      <AiOperatorActionsClient />
    </VyronCostShell>
  );
}
