import { CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import ApprovalCentreClient from "@/components/ApprovalCentreClient";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { getApprovals } from "@/lib/vyron-approval-data";
import { formatMoney } from "@/lib/vyron-cost-data";
import { shouldUseWorkspaceDemoData } from "@/lib/vyron-workspace-server";

export default async function ApprovalsPage() {
  const clientDemo = await shouldUseWorkspaceDemoData();
  const approvals = await getApprovals();

  const pending = approvals.filter((item) => item.status === "Pending");
  const approved = approvals.filter((item) => item.status === "Approved");
  const rejected = approvals.filter((item) => item.status === "Rejected");
  const impact = pending.reduce((sum, item) => sum + Number(item.financial_impact || 0), 0);

  return (
    <VyronCostShell hidePageHeader title={clientDemo ? "Handcrafted Approvals" : "Approvals"}
      subtitle={clientDemo ? "GP OVERRIDES · SUPPLIER INCREASES · IMPORTED PRODUCTS" : "PRICE, GP AND YIELD CONTROL"}
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Pending" value={String(pending.length)} note="Awaiting decision" icon={Clock} dark />
        <EnterpriseMetricCard title="Approved" value={String(approved.length)} note="Approved changes" icon={CheckCircle2} />
        <EnterpriseMetricCard title="Rejected" value={String(rejected.length)} note="Rejected changes" icon={XCircle} />
        <EnterpriseMetricCard title="Impact" value={formatMoney(impact)} note="Pending financial exposure" icon={ShieldAlert} />
      </section>

      <ApprovalCentreClient approvals={approvals} />
    </VyronCostShell>
  );
}
