"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CostSupplier } from "@/lib/vyron-cost-core-data";
import { supabase } from "@/lib/supabase";
import { FieldHint, VyronFieldGuide } from "@/components/VyronFieldGuide";

const emptyForm = {
  supplier_name: "",
  category: "Supplier",
  contact_email: "",
  invoice_email: "",
  phone: "",
  risk_status: "Active",
  last_price_movement: "0",
  payment_terms: "30 Days",
  lead_time_days: "0",
  notes: "",
};

export default function SupplierManagerClient({ initialSuppliers }: { initialSuppliers: CostSupplier[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((s) => [s.supplier_name, s.category || "", s.risk_status || ""].join(" ").toLowerCase().includes(term));
  }, [suppliers, search]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function edit(supplier: CostSupplier) {
    setEditingId(supplier.id);
    setForm({
      supplier_name: supplier.supplier_name || "",
      category: supplier.category || "Supplier",
      contact_email: supplier.contact_email || "",
      invoice_email: supplier.invoice_email || "",
      phone: supplier.phone || "",
      risk_status: supplier.risk_status || "Active",
      last_price_movement: String(supplier.last_price_movement || 0),
      payment_terms: supplier.payment_terms || "30 Days",
      lead_time_days: String(supplier.lead_time_days || 0),
      notes: supplier.notes || "",
    });
  }

  async function save() {
    setMessage("");
    setErrorMessage("");

    if (!form.supplier_name.trim()) {
      setErrorMessage("Supplier name is required.");
      return;
    }

    const payload = {
      supplier_name: form.supplier_name.trim(),
      category: form.category,
      contact_email: form.contact_email || null,
      invoice_email: form.invoice_email || null,
      phone: form.phone || null,
      risk_status: form.risk_status,
      last_price_movement: Number(form.last_price_movement || 0),
      payment_terms: form.payment_terms,
      lead_time_days: Number(form.lead_time_days || 0),
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (!supabase) {
      const local = { id: editingId || crypto.randomUUID(), ...payload } as CostSupplier;
      setSuppliers((current) => editingId ? current.map((s) => s.id === editingId ? local : s) : [...current, local]);
      setForm(emptyForm);
      setEditingId(null);
      setMessage("Supplier saved locally in demo mode.");
      return;
    }

    if (editingId && !editingId.startsWith("demo")) {
      const { data, error } = await supabase.from("vyron_cost_suppliers").update(payload).eq("id", editingId).select("*").single();
      if (error) return setErrorMessage(error.message);
      setSuppliers((current) => current.map((s) => s.id === editingId ? data as CostSupplier : s));
    } else {
      const { data, error } = await supabase.from("vyron_cost_suppliers").insert(payload).select("*").single();
      if (error) return setErrorMessage(error.message);
      setSuppliers((current) => [...current, data as CostSupplier].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
    }

    setForm(emptyForm);
    setEditingId(null);
    setMessage("Supplier saved.");
  }

  async function remove(id: string) {
    setSuppliers((current) => current.filter((s) => s.id !== id));
    if (supabase && !id.startsWith("demo")) await supabase.from("vyron_cost_suppliers").delete().eq("id", id);
  }

  const supplierGuide = [
    { title: "Supplier Name", icon: "truck" as const, description: "Use the trading name that appears on invoices and purchase orders.", example: "Cape Flour Mills, BASIC FOODS" },
    { title: "Category", icon: "folder" as const, description: "Group suppliers by what they mainly provide.", example: "Protein, Packaging, Dry Goods" },
    { title: "Invoice Email", icon: "info" as const, description: "The email address invoices usually come from or should be sent to.", example: "accounts@supplier.co.za" },
    { title: "Risk Status", icon: "percent" as const, description: "Use this to show whether supplier pricing or reliability needs attention.", example: "Active, Monitor, Review, High Risk" },
  ];

  return (
    <section className="grid gap-6 2xl:grid-cols-[0.9fr_1.4fr_360px]">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Plus size={22} /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">{editingId ? "Edit Supplier" : "Add Supplier"}</h2>
            <p className="text-sm font-semibold text-slate-500">Supplier details, risk and contact information.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-900">Supplier Name <span className="text-red-500">*</span><input value={form.supplier_name} onChange={(e) => update("supplier_name", e.target.value)} placeholder="Supplier Name" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" /><FieldHint example="Cape Flour Mills, BASIC FOODS">Enter the legal or trading name used on invoices and purchase orders.</FieldHint></label>
          <label className="text-sm font-black text-slate-900">Category<input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="Category" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" /><FieldHint example="Protein, Packaging, Dry Goods">Group suppliers by what they mainly provide.</FieldHint></label>
          <label className="text-sm font-black text-slate-900">Contact Email<input value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} placeholder="Contact Email" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" /><FieldHint example="sales@supplier.co.za">Main sales or account contact.</FieldHint></label>
          <label className="text-sm font-black text-slate-900">Invoice Email<input value={form.invoice_email} onChange={(e) => update("invoice_email", e.target.value)} placeholder="Invoice Email" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" /><FieldHint example="accounts@supplier.co.za">Used for invoice matching and future email intelligence.</FieldHint></label>
          <div className="grid gap-4 md:grid-cols-2">
            <input value={form.risk_status} onChange={(e) => update("risk_status", e.target.value)} placeholder="Risk Status" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
            <input type="number" value={form.last_price_movement} onChange={(e) => update("last_price_movement", e.target.value)} placeholder="Price Movement %" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          </div>
          <button onClick={save} className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white">Save Supplier</button>
          {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-black text-slate-900">Suppliers</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <Search size={18} className="text-violet-700" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." className="w-64 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[220px_150px_130px_130px_160px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <div>Supplier</div><div>Category</div><div>Risk</div><div>Movement</div><div>Actions</div>
            </div>
            {filtered.map((supplier) => (
              <div key={supplier.id} className="grid grid-cols-[220px_150px_130px_130px_160px] items-center border-t border-slate-100 px-5 py-4 text-sm">
                <Link href={`/suppliers/${supplier.id}`} className="font-black text-violet-700">{supplier.supplier_name}</Link>
                <div className="font-bold text-slate-500">{supplier.category}</div>
                <div className="font-black text-violet-700">{supplier.risk_status}</div>
                <div className={`font-black ${Number(supplier.last_price_movement || 0) > 5 ? "text-red-600" : "text-emerald-600"}`}>{Number(supplier.last_price_movement || 0).toFixed(1)}%</div>
                <div className="flex gap-2">
                  <button onClick={() => edit(supplier)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                  <button onClick={() => remove(supplier.id)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    <VyronFieldGuide title="Supplier Field Guide" subtitle="What each supplier field means." items={supplierGuide} />
    </section>
  );
}
