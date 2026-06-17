import { GlobalPermissionsClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function GlobalPermissionsPage() {
  const { globalPermissions } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="Global Permissions" subtitle="GROUP CEO · CFO · REGIONAL · DIRECTOR · BRANCH · AUDITOR">
      <PlatformNav />
      <GlobalPermissionsClient matrix={globalPermissions} />
    </VyronCostShell>
  );
}
