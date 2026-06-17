import RolePermissionMatrixClient from "@/components/enterprise/RolePermissionMatrixClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getRolePermissionMatrix } from "@/lib/vyron-enterprise-permissions";

export default async function EnterpriseRolesPage() {
  const matrix = await getRolePermissionMatrix();
  return (
    <VyronCostShell hidePageHeader title="Role & Permission Engine" subtitle="ENTERPRISE CONTROLS · MODULE-LEVEL ACCESS">
      <RolePermissionMatrixClient matrix={matrix} />
    </VyronCostShell>
  );
}
