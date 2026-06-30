"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreRow } from "@/lib/vyron-store-orders";

type StoreForm = {
  store_code: string;
  store_name: string;
  address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  notes: string;
};

function toForm(store: StoreRow): StoreForm {
  return {
    store_code: store.store_code || "",
    store_name: store.store_name || "",
    address: store.address || "",
    contact_name: store.contact_name || "",
    contact_email: store.contact_email || "",
    contact_phone: store.contact_phone || "",
    status: store.status || "Active",
    notes: store.notes || "",
  };
}

export default function StoreDetailPageClient({ store }: { store: StoreRow }) {
  const router = useRouter();
  const { canEdit, canDelete } = useModulePermissions("stores");
  const [form, setForm] = useState<StoreForm>(() => toForm(store));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this store? Stores with orders cannot be deleted.");

  function update(field: keyof StoreForm, value: string) {
    if (!canEdit) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveStore() {
    if (!canEdit) {
      setMessage("You do not have permission to edit stores.");
      return;
    }
    if (!form.store_code.trim() || !form.store_name.trim()) {
      setMessage("Store code and name are required.");
      return;
    }

    const response = await fetch(`/api/stores/${store.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!data.ok) {
      setMessage(data.error || "Could not save store.");
      return;
    }

    setMessage("Store saved.");
  }

  function requestDelete() {
    if (!canDelete) {
      setMessage("You do not have permission to delete stores.");
      return;
    }

    deleteConfirm.requestDelete(async () => {
      const response = await fetch(`/api/stores/${store.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || "Could not delete store.");
        return;
      }
      router.push("/stores");
    });
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">Store Detail</h2>
        <Link href="/stores" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
          Back to Stores
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-black text-slate-600">
          Store Code
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.store_code} onChange={(event) => update("store_code", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Store Name
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.store_name} onChange={(event) => update("store_name", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Contact Name
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.contact_name} onChange={(event) => update("contact_name", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Contact Email
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.contact_email} onChange={(event) => update("contact_email", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Contact Phone
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.contact_phone} onChange={(event) => update("contact_phone", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600">
          Status
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.status} onChange={(event) => update("status", event.target.value)} disabled={!canEdit}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
        <label className="text-sm font-black text-slate-600 md:col-span-2">
          Address
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.address} onChange={(event) => update("address", event.target.value)} disabled={!canEdit} />
        </label>
        <label className="text-sm font-black text-slate-600 md:col-span-2">
          Notes
          <textarea className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2.5" value={form.notes} onChange={(event) => update("notes", event.target.value)} disabled={!canEdit} />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {canEdit ? (
          <button type="button" onClick={saveStore} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
            <Save size={16} /> Save Store
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" onClick={requestDelete} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">
            <Trash2 size={16} /> Delete Store
          </button>
        ) : null}
      </div>

      {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</div> : null}

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        message={deleteConfirm.message}
        confirming={deleteConfirm.confirming}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </section>
  );
}
