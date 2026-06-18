import { Suspense } from "react";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import XeroIntegrationClient from "@/components/vyron-cost/integrations/XeroIntegrationClient";
import { buildWorkspaceStatusReport, isXeroWorkspaceActive } from "@/lib/vyron-workspace-status";

export default async function Page() {
  const status = await buildWorkspaceStatusReport();
  const initialWorkspace = {
    hasWorkspace: isXeroWorkspaceActive(status),
    workspaceName: status.workspaceName || "",
    companyLinked: status.companyLinked,
    workspaceId: status.workspaceId,
    companyId: status.companyId,
    xeroWorkspaceReady: status.xeroWorkspaceReady,
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
