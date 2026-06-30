import VyronCostAiShell from "@/components/VyronCostAiShell";
import ApprovalQueueClient from "@/components/vyron-cost/store-ordering/ApprovalQueueClient";

export default function StoreOrderApprovalsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Approval Queue" subtitle="Submitted store orders awaiting approval.">
      <ApprovalQueueClient />
    </VyronCostAiShell>
  );
}
