"use client";

import { Plus, Search, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreRow } from "@/lib/vyron-store-orders";

const emptyForm = {
  store_code: "",
  store_name: "",
  address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  status: "Active",
  notes: "",
};

export default function StoresClient() {
  const { canCreate, canEdit, canDelete } = useModulePermissions("stores");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteConfirm = useConfirmDelete("Delete this store? Stores with orders cannot be deleted.");

  async function loadStores() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stores");
      const data = await response.json();
      if (data.ok && Array.isArray(data.stores)) {
        setStores(data.stores as StoreRow[]);
        return;
      }
      setStores([]);
      setError(data.error || "Could not load stores.");
    } catch {
      setStores([]);
      setError("Could not load stores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStores();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stores;
    return stores.filter((store) =>
      [store.store_code, store.store_name, store.address || "", store.contact_name || "", store.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [stores, search]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(store: StoreRow) {
    setEditingId(store.id);
    setForm({
      store_code: store.store_code,
      store_name: store.store_name,
      address: store.address || "",
      contact_name: store.contact_name || "",
      contact_email: store.contact_email || "",
      contact_phone: store.contact_phone || "",
      status: store.status,
      notes: store.notes || "",
    });
  }

  async function saveStore() {
    if (!form.store_code.trim() || !form.store_name.trim()) {
      setError("Store code and name are required.");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(editingId ? `/api/stores/${editingId}` : "/api/stores", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Save failed.");
        return;
      }
      setMessage(editingId ? "Store updated." : "Store created.");
      resetForm();
      await loadStores();
    } catch {
      setError("Save failed.");
    }
  }

  async function removeStore(id: string) {
    const response = await fetch(`/api/stores/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Delete failed.");
      return;
    }
    setMessage("Store deleted.");
    if (editingId === id) resetForm();
    await loadStores();
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Stores Master",
        subtitle: "Retail and depot locations that place store orders against finished goods.",
        outcomes: [
          "Maintain store codes and contacts",
          "Control active stores for ordering",
          "Multi-tenant store registry per workspace company",
        ],
      }}
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {(canCreate || (canEdit && editingId)) && (
          <section className={`${VYRON_MASTER.moduleDataSection} space-y-4`}>
            <h2 className="text-lg font-black text-[#0F172A]">
              {editingId ? "Edit Store" : "Add Store"}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.store_code}
                onChange={(e) => setForm((c) => ({ ...c, store_code: e.target.value }))}
                placeholder="Store code"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              />
              <input
                value={form.store_name}
                onChange={(e) => setForm((c) => ({ ...c, store_name: e.target.value }))}
                placeholder="Store name"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              />
              <input
                value={form.contact_name}
                onChange={(e) => setForm((c) => ({ ...c, contact_name: e.target.value }))}
                placeholder="Contact name"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              />
              <input
                value={form.contact_email}
                onChange={(e) => setForm((c) => ({ ...c, contact_email: e.target.value }))}
                placeholder="Contact email"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              />
              <input
                value={form.contact_phone}
                onChange={(e) => setForm((c) => ({ ...c, contact_phone: e.target.value }))}
                placeholder="Contact phone"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              />
              <select
                value={form.status}
                onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <input
                value={form.address}
                onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                placeholder="Address"
                className="rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm md:col-span-2"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                placeholder="Notes"
                className="min-h-[88px] rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm md:col-span-2"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveStore()}
                className={`${VYRON_MASTER.primaryBtn} inline-flex items-center gap-2 px-4 py-2.5 text-sm`}
              >
                <Plus size={16} />
                {editingId ? "Update Store" : "Create Store"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </section>
        )}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-black text-[#0F172A]">Stores</h2>
            <div className="relative min-w-[240px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stores"
                className="w-full rounded-xl border border-[#E2E8F0] py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading stores…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No stores found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((store) => (
                    <tr key={store.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3 font-mono text-sm">{store.store_code}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                          <Store size={16} className="text-[#64748B]" />
                          <Link href={`/stores/${store.id}`} className="hover:underline">{store.store_name}</Link>
                        </div>
                        <div className="text-xs text-[#64748B]">{store.address || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">
                        <div>{store.contact_name || "—"}</div>
                        <div>{store.contact_email || store.contact_phone || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                            store.status === "Active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {store.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => startEdit(store)}
                              className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold"
                            >
                              Edit
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() =>
                                deleteConfirm.requestDelete(() => void removeStore(store.id))
                              }
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        message={deleteConfirm.message}
        confirming={deleteConfirm.confirming}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </VyronPremiumPageShell>
  );
}
