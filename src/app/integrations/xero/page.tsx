import { Suspense } from "react";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroIntegrationClient from "@/components/vyron-cost/integrations/XeroIntegrationClient";
import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export default async function Page() {
  const [workspace, companyId] = await Promise.all([getServerActiveWorkspace(), getWorkspaceCompanyId()]);
  const workspaceName = workspace?.companyName || workspace?.tradingName || "";
  const initialWorkspace = {
    hasWorkspace: Boolean(workspace?.id),
    workspaceName,
    companyLinked: Boolean(companyId),
  };

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Xero Integration"
      subtitle="Connect VYRON COST to Xero for accounting-ready customers, suppliers, invoices, purchase bills and sync audit visibility."
    >
      <Suspense
        fallback={
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-sm font-semibold text-[#64748B]">
            Loading Xero integration…
          </div>
        }
      >
        <XeroIntegrationClient initialWorkspace={initialWorkspace} />
      </Suspense>
    </VyronCostAiShell>
  );
}
