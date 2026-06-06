import { MultiCompanyClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function MultiCompanyPage() {
  const { multiCompany } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell title="Multi-Company Platform" subtitle="HOLDING · SUBSIDIARIES · DIVISIONS · BRANCHES">
      <PlatformNav />
      <MultiCompanyClient data={multiCompany} />
    </VyronCostShell>
  );
}
