import { BenchmarkingClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function BenchmarkingPage() {
  const { benchmarking } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Benchmarking Engine" subtitle="BRANCHES · COMPANIES · BEST · WORST · OPPORTUNITIES">
      <PlatformNav />
      <BenchmarkingClient engines={benchmarking} />
    </VyronCostShell>
  );
}
