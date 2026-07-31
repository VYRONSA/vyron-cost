"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Power } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type SupplierSummary = {
  supplierName: string;
  mappingCount: number;
  activeCount: number;
  lastUsedAt: string | null;
  avgConfidence: number;
};

type MappingRow = {
  id: string;
  supplier_name: string;
  supplier_vat_number: string | null;
  source_description: string;
  source_sku: string | null;
  unit: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  last_approved_price: number | null;
  confidence_score: number;
  approved_by: string | null;
  approved_at: string | null;
  usage_count: number;
  last_seen_at: string;
  disabled: boolean;
};

type EditState = {
  id: string;
  sourceDescription: string;
  unit: string;
  entityType: "ingredient" | "packaging" | "product";
  entityName: string;
  disabled: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return value.slice(0, 10);
}

export default function SupplierLearningClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedSupplier) params.set("supplier", selectedSupplier);
      if (showDisabled) params.set("includeDisabled", "1");
      const res = await fetch(`/api/documents/learning/mappings?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load mappings.");
      setSuppliers(json.suppliers || []);
      setMappings(json.mappings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load supplier learning.");
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier, showDisabled]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMappings = useMemo(() => {
    if (!selectedSupplier) return mappings;
    return mappings.filter((row) => row.supplier_name === selectedSupplier);
  }, [mappings, selectedSupplier]);

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/documents/learning/mappings/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDescription: edit.sourceDescription,
          unit: edit.unit || null,
          entityType: edit.entityType,
          entityName: edit.entityName,
          disabled: edit.disabled,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not save mapping.");
      setEdit(null);
      setMessage("Mapping updated. Prior mapping kept in audit history.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDisabled(row: MappingRow) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/learning/mappings/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !row.disabled }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not update mapping.");
      setMessage(row.disabled ? "Mapping re-enabled." : "Mapping disabled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Learning",
        subtitle: "Premium VYRON COST workflow for supplier learning.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  href="/document-intelligence"
                  className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700 hover:text-violet-900"
                >
                  ← Back
                  Document Intelligence
                </Link>
                <h2 className="text-2xl font-black text-slate-950">Supplier Learning</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Review remembered line mappings per supplier. Disabled mappings stay in audit history.
                </p>
              </div>
              {loading ? (
                <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Loading…
                </span>
              ) : null}
            </div>

            {message ? <p className="rounded-xl border border-[#A855F7]/25 bg-[#A855F7]/10 px-4 py-2 text-sm font-semibold text-[#4D7C0F]">{message}</p> : null}
            {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <section className="rounded-[2rem] border border-violet-100 bg-white p-5">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Suppliers</h3>
                <button
                  type="button"
                  onClick={() => setSelectedSupplier("")}
                  className={`mt-3 w-full rounded-xl px-3 py-2 text-left text-sm font-bold ${
                    !selectedSupplier ? "bg-violet-100 text-violet-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  All suppliers
                </button>
                <div className="mt-2 max-h-[520px] space-y-1 overflow-y-auto">
                  {suppliers.map((row) => (
                    <button
                      key={row.supplierName}
                      type="button"
                      onClick={() => setSelectedSupplier(row.supplierName)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                        selectedSupplier === row.supplierName ? "bg-violet-100 font-black text-violet-900" : "font-semibold text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div>{row.supplierName}</div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {row.activeCount} active · last {formatDate(row.lastUsedAt)}
                      </div>
                    </button>
                  ))}
                  {!suppliers.length && !loading ? (
                    <p className="px-2 py-4 text-sm font-semibold text-slate-500">Approve or save invoice reviews to build learning.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[2rem] border border-violet-100 bg-white p-5 overflow-x-auto">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Learned item mappings</h3>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={showDisabled}
                      onChange={(e) => setShowDisabled(e.target.checked)}
                    />
                    Show disabled
                  </label>
                </div>

                <table className="min-w-[960px] w-full text-left text-sm">
                  <thead className="text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Supplier line</th>
                      <th className="py-2 pr-3">SKU</th>
                      <th className="py-2 pr-3">Matched item</th>
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 pr-3">Last price</th>
                      <th className="py-2 pr-3">Confidence</th>
                      <th className="py-2 pr-3">Last used</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map((row) => (
                      <tr key={row.id} className={`border-t border-slate-100 ${row.disabled ? "opacity-50" : ""}`}>
                        <td className="py-3 pr-3 font-semibold text-slate-800">{row.source_description}</td>
                        <td className="py-3 pr-3 text-slate-600">{row.source_sku || "—"}</td>
                        <td className="py-3 pr-3">
                          <div className="font-black text-violet-800">{row.entity_name || "—"}</div>
                          <div className="text-[11px] text-slate-400">{row.entity_type}</div>
                        </td>
                        <td className="py-3 pr-3">{row.unit || "—"}</td>
                        <td className="py-3 pr-3">
                          {row.last_approved_price !== null ? `R${Number(row.last_approved_price).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-3 pr-3">{Number(row.confidence_score || 0)}%</td>
                        <td className="py-3 pr-3">{formatDate(row.last_seen_at)}</td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                setEdit({
                                  id: row.id,
                                  sourceDescription: row.source_description,
                                  unit: row.unit || "",
                                  entityType: (row.entity_type as EditState["entityType"]) || "ingredient",
                                  entityName: row.entity_name || "",
                                  disabled: row.disabled,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black uppercase text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => toggleDisabled(row)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-black uppercase text-slate-700 hover:bg-slate-50"
                            >
                              <Power size={12} />
                              {row.disabled ? "Enable" : "Disable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredMappings.length && !loading ? (
                  <p className="py-8 text-center text-sm font-semibold text-slate-500">No mappings for this filter.</p>
                ) : null}
              </section>
            </div>

            {edit ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                  <h3 className="text-lg font-black text-slate-950">Edit mapping</h3>
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-black uppercase text-slate-500">
                      Supplier description
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                        value={edit.sourceDescription}
                        onChange={(e) => setEdit({ ...edit, sourceDescription: e.target.value })}
                      />
                    </label>
                    <label className="block text-xs font-black uppercase text-slate-500">
                      Unit
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                        value={edit.unit}
                        onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                      />
                    </label>
                    <label className="block text-xs font-black uppercase text-slate-500">
                      Matched type
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                        value={edit.entityType}
                        onChange={(e) =>
                          setEdit({ ...edit, entityType: e.target.value as EditState["entityType"] })
                        }
                      >
                        <option value="ingredient">Ingredient</option>
                        <option value="packaging">Packaging</option>
                        <option value="product">Product</option>
                      </select>
                    </label>
                    <label className="block text-xs font-black uppercase text-slate-500">
                      Matched item name
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                        value={edit.entityName}
                        onChange={(e) => setEdit({ ...edit, entityName: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={edit.disabled}
                        onChange={(e) => setEdit({ ...edit, disabled: e.target.checked })}
                      />
                      Disabled (excluded from auto-suggest)
                    </label>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEdit(null)}
                      className="rounded-xl px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveEdit}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
    </VyronPremiumPageShell>
  );
}
