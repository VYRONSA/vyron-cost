import VyronCostAiShell from "@/components/VyronCostAiShell";
import SupplierInvoiceDetailClient from "@/components/vyron-cost/suppliers/SupplierInvoiceDetailClient";

export default async function SupplierInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Supplier Invoice"
      subtitle="REVIEW AND AMEND A PROCESSED SUPPLIER INVOICE."
    >
      <SupplierInvoiceDetailClient invoiceId={id} />
    </VyronCostAiShell>
  );
}
