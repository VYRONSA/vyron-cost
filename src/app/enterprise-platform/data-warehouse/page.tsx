import { DataWarehouseClient, PlatformNav } from "@/components/enterprise-platform/EnterprisePlatformClients";
import VyronCostShell from "@/components/VyronCostShell";
import { getEnterprisePlatformPayload } from "@/lib/vyron-enterprise-platform-architecture";

export default async function DataWarehousePage() {
  const { dataWarehouse } = await getEnterprisePlatformPayload();
  return (
    <VyronCostShell hidePageHeader title="Data Warehouse Layer" subtitle="OPERATIONAL · HISTORICAL · ANALYTICAL · FORECAST · AUDIT · RECOVERY">
      <PlatformNav />
      <DataWarehouseClient layers={dataWarehouse} />
    </VyronCostShell>
  );
}
