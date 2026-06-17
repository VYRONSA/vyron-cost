import ApprovalMatrixClient from "@/components/enterprise/ApprovalMatrixClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getApprovalMatrix } from "@/lib/vyron-enterprise-approval-matrix";

export default async function ApprovalMatrixPage() {
  const data = await getApprovalMatrix();
  return (
    <VyronCostShell hidePageHeader title="Approval Matrix" subtitle="PO · INVOICES · INVENTORY · PRODUCTION · RECOVERY">
      <ApprovalMatrixClient data={data} />
    </VyronCostShell>
  );
}
