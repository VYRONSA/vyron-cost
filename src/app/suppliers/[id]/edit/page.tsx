import EditRouteGuard from "@/components/EditRouteGuard";
import SupplierEditPageClient from "@/components/SupplierEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getSupplierById } from "@/lib/vyron-cost-core-data";
import { notFound } from "next/navigation";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await getSupplierById(id);

  if (!supplier) notFound();

  return (
    <VyronCostShell hidePageHeader title={`Edit ${supplier.supplier_name}`}
      subtitle="Full-page supplier editing workspace with invoice routing, risk and procurement details."
    >
      <EditRouteGuard permission="edit_suppliers">
        <SupplierEditPageClient supplier={supplier} />
      </EditRouteGuard>
    </VyronCostShell>
  );
}
