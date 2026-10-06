import VyronCostAiShell from "@/components/VyronCostAiShell";
import SupplierReconciliationClient from "@/components/vyron-cost/suppliers/SupplierReconciliationClient";

export default function SupplierReconciliationPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Supplier Reconciliation" subtitle="Supplier statements reconciled against VOLORA supplier invoices">
      <SupplierReconciliationClient />
    </VyronCostAiShell>
  );
}
