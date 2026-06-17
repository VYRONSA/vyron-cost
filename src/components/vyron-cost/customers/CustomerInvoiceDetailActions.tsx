"use client";

import BackButton from "@/components/vyron-cost/BackButton";
import DeleteConfirmModal from "@/components/vyron-cost/DeleteConfirmModal";
import { useInvoicePermissions } from "@/hooks/useModulePermissions";

export default function CustomerInvoiceDetailActions({ invoiceNumber }: { invoiceNumber: string }) {
  const { canEmail, canDelete } = useInvoicePermissions();

  return (
    <>
      <BackButton />
      <button type="button" onClick={() => window.print()} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black">
        Print
      </button>
      {canEmail ? (
        <button type="button" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black">
          Email
        </button>
      ) : null}
      {canDelete ? (
        <DeleteConfirmModal itemName={invoiceNumber} itemType="customer invoice" onConfirm={() => undefined} />
      ) : null}
    </>
  );
}
