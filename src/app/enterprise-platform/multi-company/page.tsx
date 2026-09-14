import { MultiCompanyClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function MultiCompanyPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { multiCompany } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Multi-Company Platform" subtitle="HOLDING · SUBSIDIARIES · DIVISIONS · BRANCHES">
      <PlatformNav />
      <MultiCompanyClient data={multiCompany} />
    </VyronCostShell>
  );
}
