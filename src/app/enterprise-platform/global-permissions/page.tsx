import { GlobalPermissionsClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function GlobalPermissionsPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { globalPermissions } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Global Permissions" subtitle="GROUP CEO · CFO · REGIONAL · DIRECTOR · BRANCH · AUDITOR">
      <PlatformNav />
      <GlobalPermissionsClient matrix={globalPermissions} />
    </VyronCostShell>
  );
}
