"use client";

import { useCallback, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";

import type { CustomerBranch } from "@/lib/vyron-customer-branches";

/**
 * A customer's branches or sites.
 *
 * One customer, several places it trades from. The customer stays the
 * commercial relationship — the account, the VAT number, the credit limit —
 * and a branch says which of its shops a particular invoice belongs to.
 *
 * A branch is never deleted from here. Once it has invoiced it is part of the
 * record of what happened, so it is deactivated instead: it stops being offered
 * on new invoices and everything already raised against it stays exactly as it
 * was.
 */

const EMPTY = {
  branch_code: "",
  branch_name: "",
  description: "",
  contact_person: "",
  phone: "",
  mobile: "",
  email: "",
  address_line1: "",
  address_line2: "",
  suburb: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
  delivery_instructions: "",
  notes: "",
};

type Draft = typeof EMPTY;

const labelClass = "text-[10px] font-black uppercase tracking-[0.14em] text-slate-500";
const inputClass =
  "mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400";

export default function CustomerBranchesPanel({
  customerId,
  initialBranches,
  canEdit = true,
}: {
  customerId: string;
  /** Rendered on the server, so the table is there on first paint. */
  initialBranches: CustomerBranch[];
  canEdit?: boolean;
}) {
  const [branches, setBranches] = useState<CustomerBranch[]>(initialBranches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CustomerBranch | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  /*
   * Re-read the list after a change. The first list came from the server with
   * the page, so nothing is fetched on mount and the table is never briefly
   * empty.
   */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/branches`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Branches could not be loaded.");
      setBranches(data.branches || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Branches could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  function openAdd() {
    setDraft(EMPTY);
    setEditing(null);
    setAdding(true);
  }

  function openEdit(branch: CustomerBranch) {
    setDraft({
      branch_code: branch.branch_code || "",
      branch_name: branch.branch_name || "",
      description: branch.description || "",
      contact_person: branch.contact_person || "",
      phone: branch.phone || "",
      mobile: branch.mobile || "",
      email: branch.email || "",
      address_line1: branch.address_line1 || "",
      address_line2: branch.address_line2 || "",
      suburb: branch.suburb || "",
      city: branch.city || "",
      province: branch.province || "",
      postal_code: branch.postal_code || "",
      country: branch.country || "",
      delivery_instructions: branch.delivery_instructions || "",
      notes: branch.notes || "",
    });
    setAdding(false);
    setEditing(branch);
  }

  async function save() {
    if (!draft.branch_name.trim()) {
      setError("A branch needs a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = editing
        ? `/api/customers/${customerId}/branches/${editing.id}`
        : `/api/customers/${customerId}/branches`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The branch could not be saved.");
      setAdding(false);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The branch could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(branch: CustomerBranch, isActive: boolean) {
    setError("");
    try {
      const res = await fetch(`/api/customers/${customerId}/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The branch could not be updated.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The branch could not be updated.");
    }
  }

  const open = adding || Boolean(editing);

  return (
    <section className="mt-4 rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Branches / Sites</div>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Where this customer trades from. Invoices can be raised against a branch; the customer stays one account.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-2.5 text-sm font-black text-white"
          >
            <Plus size={16} /> Add Branch
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm font-semibold text-slate-500">Loading branches…</p>
      ) : branches.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
          <MapPin className="mx-auto text-slate-300" size={26} />
          <p className="mt-2 text-sm font-black text-slate-700">No branches yet</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            This customer invoices as a single site. Add a branch only if they trade from more than one place.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <th className="px-3 py-2">Branch Code</th>
                <th className="px-3 py-2">Branch Name</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-black text-slate-900">{branch.branch_code || "—"}</td>
                  <td className="px-3 py-3 font-bold text-slate-700">{branch.branch_name}</td>
                  <td className="px-3 py-3 font-semibold text-slate-500">{branch.city || "—"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-500">{branch.contact_person || "—"}</td>
                  <td className="px-3 py-3">
                    {branch.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {canEdit ? (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(branch)}
                          className="min-h-[36px] rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void setActive(branch, !branch.is_active)}
                          className="min-h-[36px] rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700"
                        >
                          {branch.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div
          role="dialog"
          aria-label={editing ? "Edit branch" : "Add branch"}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => (saving ? null : (setAdding(false), setEditing(null)))}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-black text-slate-950">{editing ? "Edit branch" : "Add branch"}</h3>
              <button
                type="button"
                onClick={() => (setAdding(false), setEditing(null))}
                className="rounded-xl bg-slate-100 p-2 text-slate-600"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Branch Code</span>
                <input
                  value={draft.branch_code}
                  onChange={(e) => setDraft({ ...draft, branch_code: e.target.value })}
                  placeholder="JHB01"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Branch Name</span>
                <input
                  autoFocus
                  value={draft.branch_name}
                  onChange={(e) => setDraft({ ...draft, branch_name: e.target.value })}
                  placeholder="Johannesburg Branch"
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Site Description</span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className={labelClass}>Contact Person</span>
                <input
                  value={draft.contact_person}
                  onChange={(e) => setDraft({ ...draft, contact_person: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Email</span>
                <input
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Telephone</span>
                <input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Mobile</span>
                <input
                  value={draft.mobile}
                  onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className={labelClass}>Address Line 1</span>
                <input
                  value={draft.address_line1}
                  onChange={(e) => setDraft({ ...draft, address_line1: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Address Line 2</span>
                <input
                  value={draft.address_line2}
                  onChange={(e) => setDraft({ ...draft, address_line2: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Suburb</span>
                <input
                  value={draft.suburb}
                  onChange={(e) => setDraft({ ...draft, suburb: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>City / Town</span>
                <input
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Province</span>
                <input
                  value={draft.province}
                  onChange={(e) => setDraft({ ...draft, province: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Postal Code</span>
                <input
                  value={draft.postal_code}
                  onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Country</span>
                <input
                  value={draft.country}
                  onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                  className={inputClass}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className={labelClass}>Delivery Instructions</span>
                <input
                  value={draft.delivery_instructions}
                  onChange={(e) => setDraft({ ...draft, delivery_instructions: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Notes</span>
                <input
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => (setAdding(false), setEditing(null))}
                className="min-h-[44px] rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="min-h-[44px] rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : editing ? "Save branch" : "Add branch"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
