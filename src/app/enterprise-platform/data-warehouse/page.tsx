import { DataWarehouseClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function DataWarehousePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { dataWarehouse } = await getEnterprisePlatformPayload(companyId);
  return (
    <VyronCostShell hidePageHeader title="Data Warehouse Layer" subtitle="OPERATIONAL · HISTORICAL · ANALYTICAL · FORECAST · AUDIT · RECOVERY">
      <PlatformNav />
      <DataWarehouseClient layers={dataWarehouse} />
    </VyronCostShell>
  );
}
