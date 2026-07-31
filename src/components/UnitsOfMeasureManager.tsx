"use client";

import { useMemo, useState } from "react";
import { Edit3, Plus, Save, Trash2, X } from "lucide-react";

type UomRow = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  category: string;
  decimal_precision: number;
  is_active: boolean;
  notes: string | null;
};

const emptyForm = {
  code: "",
  name: "",
  symbol: "",
  category: "General",
  decimal_precision: 2,
  is_active: true,
  notes: "",
};

async function json(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { _raw: raw };
  }
  return { ok: response.ok, status: response.status, data };
}

export default function UnitsOfMeasureManager({ initialUnits }: { initialUnits: UomRow[] }) {
  const [units, setUnits] = useState<UomRow[]>(initialUnits);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return units;
    return units.filter((row) => {
      return [row.code, row.name, row.symbol || "", row.category, row.notes || "", row.is_active ? "active" : "inactive"]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [search, units]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(row: UomRow) {
    setEditingId(row.id);
    setForm({
      code: row.code,
      name: row.name,
      symbol: row.symbol || "",
      category: row.category,
      decimal_precision: Number(row.decimal_precision || 2),
      is_active: Boolean(row.is_active),
      notes: row.notes || "",
    });
  }

  async function reload() {
    const res = await json("/api/units-of-measure");
    if (!res.ok || !Array.isArray(res.data.units)) {
      throw new Error(String(res.data.error || "Failed to reload units."));
    }
    setUnits(res.data.units as UomRow[]);
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) {
      setMessage("Code and name are required.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const payload = {
        code: form.code,
        name: form.name,
        symbol: form.symbol || null,
        category: form.category,
        decimal_precision: Number(form.decimal_precision || 2),
        is_active: Boolean(form.is_active),
        notes: form.notes || null,
      };

      const res = editingId
        ? await json(`/api/units-of-measure/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await json("/api/units-of-measure", { method: "POST", body: JSON.stringify(payload) });

      if (!res.ok) throw new Error(String(res.data.error || "Save failed."));
      await reload();
      resetForm();
      setMessage(editingId ? "Unit updated." : "Unit created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await json(`/api/units-of-measure/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.data.error || "Delete failed."));
      await reload();
      if (editingId === id) resetForm();
      setMessage("Unit deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.4fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-3 text-[#84CC16]">
            {editingId ? <Edit3 size={20} /> : <Plus size={20} />}
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">{editingId ? "Edit Unit" : "Create Unit"}</h2>
            <p className="text-sm text-slate-500">Maintain normalized units used across costing, inventory and reporting.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Code
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
              value={form.code}
              onChange={(e) => setForm((c) => ({ ...c, code: e.target.value }))}
            />
          </label>

          <label className="text-sm font-black text-slate-600">
            Name
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Symbol
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
                value={form.symbol}
                onChange={(e) => setForm((c) => ({ ...c, symbol: e.target.value }))}
              />
            </label>
            <label className="text-sm font-black text-slate-600">
              Category
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
                value={form.category}
                onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Decimal Precision
              <input
                type="number"
                min={0}
                max={6}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
                value={form.decimal_precision}
                onChange={(e) => setForm((c) => ({ ...c, decimal_precision: Number(e.target.value || 0) }))}
              />
            </label>
            <label className="text-sm font-black text-slate-600">
              Status
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
                value={form.is_active ? "Active" : "Inactive"}
                onChange={(e) => setForm((c) => ({ ...c, is_active: e.target.value === "Active" }))}
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
          </div>

          <label className="text-sm font-black text-slate-600">
            Notes
            <textarea
              className="mt-2 min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-4 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
            >
              <Save size={18} />
              {editingId ? "Update Unit" : "Save Unit"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-700 disabled:opacity-60"
              >
                <X size={18} />Cancel
              </button>
            )}
          </div>
          {message ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
              {message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#F8FAFC]">Unit Register</h2>
        <p className="mt-2 text-sm text-slate-500">Search and maintain unit standards by tenant.</p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, name, category or symbol"
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400"
        />

        <div className="mt-4 overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
              <div>Code</div>
              <div>Name</div>
              <div>Symbol</div>
              <div>Category</div>
              <div>Precision</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
            {filtered.map((row) => (
              <div key={row.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-4 text-sm">
                <div className="font-black text-[#F8FAFC]">{row.code}</div>
                <div className="font-bold text-slate-700">{row.name}</div>
                <div className="text-slate-600">{row.symbol || "-"}</div>
                <div className="text-slate-600">{row.category}</div>
                <div className="text-slate-600">{row.decimal_precision}</div>
                <div className={row.is_active ? "text-purple-700" : "text-slate-500"}>{row.is_active ? "Active" : "Inactive"}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE] disabled:opacity-60"
                  >
                    <Edit3 size={14} />Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-60"
                  >
                    <Trash2 size={14} />Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
