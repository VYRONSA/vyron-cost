import { BenchmarkingClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function BenchmarkingPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { benchmarking } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Benchmarking Engine" subtitle="BRANCHES · COMPANIES · BEST · WORST · OPPORTUNITIES">
      <PlatformNav />
      <BenchmarkingClient engines={benchmarking} />
    </VyronCostShell>
  );
}
