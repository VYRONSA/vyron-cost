"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { CustomerRow } from "@/lib/vyron-customer-invoices";
import {
  VAT_STATUSES,
  VAT_STATUS_LABELS,
  normaliseVatNumber,
  normaliseVatStatus,
  validateVatNumber,
  vatStatusWarning,
  type VatStatus,
} from "@/lib/vyron-tax-profile";

type CustomerForm = {
  customerName: string;
  tradingName: string;
  category: string;
  contactEmail: string;
  invoiceEmail: string;
  phone: string;
  terms: string;
  vatNumber: string;
  vatStatus: VatStatus;
  registrationNumber: string;
  billingAddress: string;
  deliveryAddress: string;
  website: string;
  status: string;
  creditLimit: string;
  onHold: boolean;
};

function toForm(customer: CustomerRow): CustomerForm {
  return {
    customerName: customer.customer_name || "",
    tradingName: customer.trading_name || "",
    category: customer.category || customer.contact_person || "Customer",
    contactEmail: customer.email || "",
    invoiceEmail: customer.invoice_email || customer.email || "",
    phone: customer.phone || "",
    terms: customer.terms || "30 Days",
    // Legacy quick-add wrote the literal "N/A" into this field. It is not a VAT
    // number and must never reach an invoice, so it is read back as blank; the
    // VAT status below is what actually records "no VAT number".
    vatNumber: /^n\/?a$/i.test(String(customer.vat_number || "").trim()) ? "" : customer.vat_number || "",
    vatStatus: normaliseVatStatus(customer.vat_status),
    registrationNumber: customer.registration_number || "",
    billingAddress: customer.billing_address || "",
    deliveryAddress: customer.delivery_address || "",
    website: customer.website || "",
    status: customer.status || (customer.active ? "Active" : "Inactive"),
    creditLimit: String(Number(customer.credit_limit || 0)),
    onHold: Boolean(customer.on_hold),
  };
}

export default function CustomerDetailPageClient({ customer }: { customer: CustomerRow }) {
  const router = useRouter();
  const { canEdit, canDelete } = useModulePermissions("customers");
  const [form, setForm] = useState<CustomerForm>(() => toForm(customer));
  // What was stored when this page loaded. A pre-existing malformed number is
  // left alone rather than blocking unrelated edits; only a change is validated.
  const [savedVatNumber, setSavedVatNumber] = useState(() => toForm(customer).vatNumber);
  const vatChanged = normaliseVatNumber(form.vatNumber) !== normaliseVatNumber(savedVatNumber);
  const vatError = vatChanged ? validateVatNumber(form.vatNumber) : "";
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
    if (vatError) {
      setMessage(vatError);
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

    setSavedVatNumber(form.vatNumber);
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
          Trading Name
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.tradingName} onChange={(event) => update("tradingName", event.target.value)} disabled={!canEdit} />
          <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">
            Only where it differs from the registered name above.
          </span>
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
          Status
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.status} onChange={(event) => update("status", event.target.value)} disabled={!canEdit}>
            <option>Active</option>
            <option>Watch</option>
            <option>Review</option>
            <option>On Hold</option>
            <option>Inactive</option>
          </select>
        </label>
        <label className="text-sm font-black text-slate-600">
          Credit Limit
          <input
            type="number"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
            value={form.creditLimit}
            onChange={(event) => update("creditLimit", event.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="mt-7 inline-flex items-center gap-2 text-sm font-black text-slate-600">
          <input
            type="checkbox"
            checked={form.onHold}
            onChange={(event) => setForm((current) => ({ ...current, onHold: event.target.checked }))}
            disabled={!canEdit}
          />
          Customer On Hold
        </label>
      </div>

      <div className="mt-8 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
        <h2 className="text-base font-black text-slate-900">Tax &amp; Legal Details</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          A full tax invoice over R5,000 must show the recipient&rsquo;s name, address, and &mdash; where they are a
          registered vendor &mdash; their VAT number. Below R5,000 an abridged invoice may omit all three.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-black text-slate-600">
            VAT Status
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              value={form.vatStatus}
              onChange={(event) => update("vatStatus", event.target.value)}
              disabled={!canEdit}
            >
              {VAT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {VAT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">
              Registration is never assumed from a VAT number alone.
            </span>
          </label>

          <label className="text-sm font-black text-slate-600">
            VAT Number
            <input
              className={
                "mt-2 w-full rounded-xl border px-3 py-2.5 " +
                (vatError ? "border-red-300" : "border-slate-200")
              }
              value={form.vatNumber}
              onChange={(event) => update("vatNumber", event.target.value)}
              disabled={!canEdit}
            />
            {vatError ? (
              <span className="mt-1.5 block text-[11px] font-bold text-red-600">{vatError}</span>
            ) : vatStatusWarning(form.vatStatus, form.vatNumber) ? (
              <span className="mt-1.5 block text-[11px] font-bold text-amber-700">
                {vatStatusWarning(form.vatStatus, form.vatNumber)}
              </span>
            ) : null}
          </label>

          <label className="text-sm font-black text-slate-600">
            Registration Number
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value)} disabled={!canEdit} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Website
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.website} onChange={(event) => update("website", event.target.value)} disabled={!canEdit} />
          </label>

          <label className="text-sm font-black text-slate-600 md:col-span-2">
            Billing Address
            <textarea
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={form.billingAddress}
              onChange={(event) => update("billingAddress", event.target.value)}
              disabled={!canEdit}
            />
            <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">
              Printed on a full tax invoice.
            </span>
          </label>

          <label className="text-sm font-black text-slate-600 md:col-span-2">
            Delivery Address
            <textarea
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              value={form.deliveryAddress}
              onChange={(event) => update("deliveryAddress", event.target.value)}
              disabled={!canEdit}
            />
            <span className="mt-1.5 block text-[11px] font-semibold text-slate-500">
              Only where goods go somewhere other than the billing address.
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/customer-sales-orders?customerId=${customer.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-800"
        >
          View Sales Orders
        </Link>
        <Link
          href={`/customer-sales-orders?customerId=${customer.id}&create=1`}
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800"
        >
          Create Sales Order
        </Link>
        {canEdit ? (
          <button type="button" onClick={saveCustomer} className="inline-flex items-center gap-2 rounded-xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
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
