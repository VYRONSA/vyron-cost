import EditRouteGuard from "@/components/EditRouteGuard";
import ProcurementPoFormClient from "@/components/ProcurementPoFormClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSuppliers } from "@/lib/vyron-cost-core-data";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suppliers = await getSuppliers();

  return (
    <VyronCostAiShell hidePageHeader title="Edit Purchase Order" subtitle="UPDATE LINES · SUPPLIER · DELIVERY">
      <EditRouteGuard permission="edit_purchase_orders">
        <ProcurementPoFormClient
          suppliers={suppliers.map((s) => ({ id: s.id, supplier_name: s.supplier_name }))}
          poId={id}
        />
      </EditRouteGuard>
    </VyronCostAiShell>
  );
}
