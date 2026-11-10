import VyronCostAiShell from "@/components/VyronCostAiShell";
import DuplicateSupplierInvoicesClient from "@/components/vyron-cost/suppliers/DuplicateSupplierInvoicesClient";

export default function DuplicateSupplierInvoicesPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Duplicate Supplier Invoices" subtitle="Review invoices captured more than once and void the duplicate safely">
      <DuplicateSupplierInvoicesClient />
    </VyronCostAiShell>
  );
}
