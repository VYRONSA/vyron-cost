import PurchaseOrderDashboardClient from "@/components/PurchaseOrderDashboardClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function PurchaseOrdersDashboardPage() {
  return (
    <VyronCostAiShell title="Purchase Orders" subtitle="Procurement control — PO, GRN and 3-way matching">
      <PurchaseOrderDashboardClient />
    </VyronCostAiShell>
  );
}
