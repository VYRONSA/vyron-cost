import EditRouteGuard from "@/components/EditRouteGuard";
import ProcurementPoFormClient from "@/components/ProcurementPoFormClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSuppliers } from "@/lib/vyron-cost-core-data";

export default async function NewPurchaseOrderPage() {
  const suppliers = await getSuppliers();
  return (
    <VyronCostAiShell hidePageHeader title="New Purchase Order" subtitle="Draft, submit and approve with line-level VAT">
      <EditRouteGuard permission="create_purchase_orders">
        <ProcurementPoFormClient
          suppliers={suppliers.map((s) => ({ id: s.id, supplier_name: s.supplier_name }))}
        />
      </EditRouteGuard>
    </VyronCostAiShell>
  );
}
