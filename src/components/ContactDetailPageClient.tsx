"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import type { VyronContact } from "@/lib/vyron-contact-master";

export default function ContactDetailPageClient({ contact }: { contact: VyronContact }) {
  const router = useRouter();
  const [isCustomer, setIsCustomer] = useState(Boolean(contact.is_customer));
  const [isSupplier, setIsSupplier] = useState(Boolean(contact.is_supplier));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this contact from Contact Master?");

  async function saveContact() {
    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_customer: isCustomer, is_supplier: isSupplier }),
    });
    const data = await response.json();
    if (!data.ok) {
      setMessage(data.error || "Could not save contact.");
      return;
    }

    setMessage("Contact saved.");
  }

  function requestDelete() {
    deleteConfirm.requestDelete(async () => {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || "Could not delete contact.");
        return;
      }
      router.push("/contacts");
    });
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">Contact Detail</h2>
        <Link href="/contacts" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
          Back to Contacts
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-black text-slate-600">
          Contact Name
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" value={contact.contact_name} readOnly />
        </label>
        <label className="text-sm font-black text-slate-600">
          Xero Contact ID
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" value={contact.xero_contact_id || ""} readOnly />
        </label>
        <label className="text-sm font-black text-slate-600">
          Email
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" value={contact.email || ""} readOnly />
        </label>
        <label className="text-sm font-black text-slate-600">
          Phone
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" value={contact.phone || ""} readOnly />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-6">
        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
          <input type="checkbox" checked={isCustomer} onChange={(event) => setIsCustomer(event.target.checked)} className="h-4 w-4" />
          Customer
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
          <input type="checkbox" checked={isSupplier} onChange={(event) => setIsSupplier(event.target.checked)} className="h-4 w-4" />
          Supplier
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={saveContact} className="inline-flex items-center gap-2 rounded-xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
          <Save size={16} /> Save Contact
        </button>
        <button type="button" onClick={requestDelete} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">
          <Trash2 size={16} /> Delete Contact
        </button>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </section>
  );
}
