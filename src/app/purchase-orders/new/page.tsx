import ProcurementPoFormClient from "@/components/ProcurementPoFormClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSuppliers } from "@/lib/vyron-cost-data";

export default async function NewPurchaseOrderPage() {
  const suppliers = await getSuppliers(200);
  return (
    <VyronCostAiShell title="New Purchase Order" subtitle="Draft, submit and approve with line-level VAT">
      <ProcurementPoFormClient suppliers={suppliers.map((s) => ({ id: s.id, supplier_name: s.supplier_name }))} />
    </VyronCostAiShell>
  );
}
