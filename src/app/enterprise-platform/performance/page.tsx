import { PerformanceClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function PerformancePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { performance } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Performance Engine" subtitle="100K+ INVOICES · MILLIONS OF TRANSACTIONS · MULTI-YEAR HISTORY">
      <PlatformNav />
      <PerformanceClient perf={performance} />
    </VyronCostShell>
  );
}
