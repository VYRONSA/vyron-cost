import ArchiveInvoiceDetailClient from "@/components/ArchiveInvoiceDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default async function ArchiveInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <VyronCostAiShell hidePageHeader title="Invoice Archive" subtitle="READ-ONLY APPROVED INVOICE WITH AUDIT TRAIL.">
      <ArchiveInvoiceDetailClient documentId={id} />
    </VyronCostAiShell>
  );
}
