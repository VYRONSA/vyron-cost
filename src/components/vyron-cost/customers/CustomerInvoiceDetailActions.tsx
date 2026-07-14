"use client";

import BackButton from "@/components/vyron-cost/BackButton";
import DeleteConfirmModal from "@/components/vyron-cost/DeleteConfirmModal";
import { useInvoicePermissions } from "@/hooks/useModulePermissions";
import { DocumentPdfActions } from "@/components/vyron-platform/documents/DocumentPdfActions";

export default function CustomerInvoiceDetailActions({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const { canEmail, canDelete } = useInvoicePermissions();

  return (
    <>
      <BackButton />
      <DocumentPdfActions
        pdfUrl={`/api/customer-invoices/${invoiceId}/pdf`}
        emailUrl={canEmail ? `/api/customer-invoices/${invoiceId}/email` : undefined}
        fileName={`${invoiceNumber}.pdf`}
      />
      {canDelete ? (
        <DeleteConfirmModal itemName={invoiceNumber} itemType="customer invoice" onConfirm={() => undefined} />
      ) : null}
    </>
  );
}
