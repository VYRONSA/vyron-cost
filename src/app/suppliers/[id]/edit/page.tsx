import SupplierEditPageClient from "@/components/SupplierEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getDemoCompanyId, getSuppliers } from "@/lib/vyron-cost-data";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [suppliers, companyId] = await Promise.all([
    getSuppliers(),
    getDemoCompanyId(),
  ]);

  const supplier = suppliers.find((item) => item.id === id) || suppliers[0];

  return (
    <VyronCostShell
      title={`Edit ${supplier?.supplier_name || "Supplier"}`}
      subtitle="Full-page supplier editing workspace with invoice routing, risk and procurement details."
    >
      <SupplierEditPageClient supplier={supplier} companyId={companyId} />
    </VyronCostShell>
  );
}
