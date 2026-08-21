import VyronCostAiShell from "@/components/VyronCostAiShell";
import SupplierInvoicesClient from "@/components/vyron-cost/suppliers/SupplierInvoicesClient";

export default function SupplierInvoicesPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Supplier Invoices"
      subtitle="MANAGE EVERY PROCESSED SUPPLIER INVOICE — SEARCH, OPEN, AMEND AND DELETE."
    >
      <SupplierInvoicesClient />
    </VyronCostAiShell>
  );
}
