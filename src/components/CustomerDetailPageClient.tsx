"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { CustomerRow } from "@/lib/vyron-customer-invoices";

type CustomerForm = {
  customerName: string;
  category: string;
  contactEmail: string;
  invoiceEmail: string;
  phone: string;
  terms: string;
  vatNumber: string;
  status: string;
};

function toForm(customer: CustomerRow): CustomerForm {
  return {
    customerName: customer.customer_name || "",
    category: customer.category || customer.contact_person || "Customer",
    contactEmail: customer.email || "",
    invoiceEmail: customer.invoice_email || customer.email || "",
    phone: customer.phone || "",
    terms: customer.terms || "30 Days",
    vatNumber: customer.vat_number || "",
    status: customer.status || (customer.active ? "Active" : "Inactive"),
  };
}

export default function CustomerDetailPageClient({ customer }: { customer: CustomerRow }) {
  const router = useRouter();
  const { canEdit, canDelete } = useModulePermissions("customers");
  const [form, setForm] = useState<CustomerForm>(() => toForm(customer));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this customer? Customers with invoices will be archived.");

  function update(field: keyof CustomerForm, value: string) {
    if (!canEdit) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveCustomer() {
    if (!canEdit) {
      setMessage("You do not have permission to edit customers.");
      return;
    }
    if (!form.customerName.trim()) {
      setMessage("Customer name is required.");
      return;
    }

    const response = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!data.ok) {
      setMessage(data.error || "Could not save customer.");
      return;
    }

    setMessage("Customer saved.");
  }

  function requestDelete() {
    if (!canDelete) {
      setMessage("You do not have permission to delete customers.");
      return;
    }

    deleteConfirm.requestDelete(async () => {
      const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || "Could not delete customer.");
        return;
      }
      router.push("/customers");
    });
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">Customer Detail</h2>
        <Link href="/customers" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
          Back to Customers
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-black text-slate-600">
          Customer Name
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.customerName} onChange={(event) => update("customerName", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Category
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.category} onChange={(event) => update("category", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Contact Email
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Invoice Email
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.invoiceEmail} onChange={(event) => update("invoiceEmail", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Phone
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.phone} onChange={(event) => update("phone", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Terms
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.terms} onChange={(event) => update("terms", event.target.value)} disabled={!canEdit}>
            <option>COD</option>
            <option>7 Days</option>
            <option>14 Days</option>
            <option>21 Days</option>
            <option>30 Days</option>
          </select>
        </label>
        <label className="text-sm font-black text-slate-600">
          VAT Number
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.vatNumber} onChange={(event) => update("vatNumber", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Status
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.status} onChange={(event) => update("status", event.target.value)} disabled={!canEdit}>
            <option>Active</option>
            <option>Watch</option>
            <option>Review</option>
            <option>Inactive</option>
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canEdit ? (
          <button type="button" onClick={saveCustomer} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
            <Save size={16} /> Save Customer
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" onClick={requestDelete} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">
            <Trash2 size={16} /> Delete Customer
          </button>
        ) : null}
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
