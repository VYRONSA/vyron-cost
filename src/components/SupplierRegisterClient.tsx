"use client";

import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CostSupplier } from "@/lib/vyron-cost-core-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const emptyForm = {
  supplier_name: "",
  category: "",
  contact_email: "",
  invoice_email: "",
  risk_status: "Active",
  last_price_movement: "0",
};

export default function SupplierRegisterClient({
  initialSuppliers,
}: {
  initialSuppliers: CostSupplier[];
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;

    return suppliers.filter((item) =>
      [
        item.supplier_name,
        item.category || "",
        item.contact_email || "",
        item.invoice_email || "",
        item.risk_status || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [suppliers, search]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(item: CostSupplier) {
    setEditingId(item.id);
    setForm({
      supplier_name: item.supplier_name || "",
      category: item.category || "",
      contact_email: item.contact_email || "",
      invoice_email: item.invoice_email || "",
      risk_status: item.risk_status || "Active",
      last_price_movement: String(item.last_price_movement || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveSupplier() {
    if (!form.supplier_name.trim()) {
      setMessage("Supplier name is required.");
      return;
    }

    const payload = {
      supplier_name: form.supplier_name.trim(),
      category: form.category.trim() || "Uncategorised",
      contact_email: form.contact_email.trim() || null,
      invoice_email: form.invoice_email.trim() || null,
      risk_status: form.risk_status.trim() || "Active",
      last_price_movement: Number(form.last_price_movement || 0),
    };

    if (supabase && !editingId?.startsWith("demo")) {
      if (editingId) {
        const { data, error } = await supabase
          .from("vyron_cost_suppliers")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single();

        if (error || !data) {
          setMessage(error?.message || "Could not update supplier.");
          return;
        }

        setSuppliers((current) =>
          current.map((item) => (item.id === editingId ? (data as CostSupplier) : item))
        );
      } else {
        const { data, error } = await supabase
          .from("vyron_cost_suppliers")
          .insert(payload)
          .select("*")
          .single();

        if (error || !data) {
          setMessage(error?.message || "Could not add supplier.");
          return;
        }

        setSuppliers((current) =>
          [...current, data as CostSupplier].sort((a, b) =>
            a.supplier_name.localeCompare(b.supplier_name)
          )
        );
      }
    } else {
      if (editingId) {
        setSuppliers((current) =>
          current.map((item) =>
            item.id === editingId ? ({ ...item, id: editingId, ...payload } as CostSupplier) : item
          )
        );
      } else {
        setSuppliers((current) =>
          [
            ...current,
            {
              id: crypto.randomUUID(),
              ...payload,
            } as CostSupplier,
          ].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
        );
      }
    }

    setMessage(editingId ? "Supplier updated." : "Supplier added.");
    resetForm();
  }

  async function deleteSupplier(id: string) {
    setSuppliers((current) => current.filter((item) => item.id !== id));

    if (supabase && !id.startsWith("demo")) {
      await supabase.from("vyron_cost_suppliers").delete().eq("id", id);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Register",
        subtitle: "Premium VYRON COST workflow for supplier register.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.35fr]">
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Plus size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">
                    {editingId ? "Edit Supplier" : "Add Supplier"}
                  </h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Supplier setup for purchasing and cost movement.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="text-sm font-black text-slate-600">
                  Supplier Name
                  <input
                    value={form.supplier_name}
                    onChange={(event) => updateForm("supplier_name", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <label className="text-sm font-black text-slate-600">
                  Category
                  <input
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <label className="text-sm font-black text-slate-600">
                  Contact Email
                  <input
                    value={form.contact_email}
                    onChange={(event) => updateForm("contact_email", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <label className="text-sm font-black text-slate-600">
                  Invoice Email
                  <input
                    value={form.invoice_email}
                    onChange={(event) => updateForm("invoice_email", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Risk Status
                    <input
                      value={form.risk_status}
                      onChange={(event) => updateForm("risk_status", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Last Price Movement %
                    <input
                      type="number"
                      value={form.last_price_movement}
                      onChange={(event) => updateForm("last_price_movement", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveSupplier}
                  className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
                >
                  {editingId ? "Save Supplier" : "Add Supplier"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}

                {message && (
                  <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#65A30D]">
                    {message}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Supplier Register</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Search, open, edit and delete suppliers.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <Search size={18} className="text-violet-700" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search suppliers..."
                    className="w-64 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  <div>Name</div>
                  <div>Category</div>
                  <div>Contact</div>
                  <div>Invoice Email</div>
                  <div>Risk</div>
                  <div>Open</div>
                  <div>Actions</div>
                </div>

                {filtered.map((item) => (
                  <div key={item.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-4 text-sm">
                    <div className="font-black text-slate-900">{item.supplier_name}</div>
                    <div className="font-bold text-slate-500">{item.category || "Uncategorised"}</div>
                    <div className="truncate font-bold text-slate-500">{item.contact_email || "—"}</div>
                    <div className="truncate font-bold text-slate-500">{item.invoice_email || "—"}</div>
                    <div className="font-black text-violet-700">{item.risk_status || "Active"}</div>
                    <div>
                      <Link href={`/suppliers/${item.id}`} className="font-black text-violet-700">
                        Open →
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-xl bg-violet-50 p-2 text-violet-700"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSupplier(item.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
