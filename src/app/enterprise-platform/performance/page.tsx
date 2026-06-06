import { PerformanceClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function PerformancePage() {
  const { performance } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Performance Engine" subtitle="100K+ INVOICES · MILLIONS OF TRANSACTIONS · MULTI-YEAR HISTORY">
      <PlatformNav />
      <PerformanceClient perf={performance} />
    </VyronCostShell>
  );
}
