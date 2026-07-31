"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { Supplier, statusTone } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  supplier_name: "",
  category: "Supplier Group",
  contact_email: "",
  invoice_email: "demo@invoices.vyroncost.com",
  risk_status: "Stable",
  last_price_movement: "0",
};

export default function SuppliersManager({
  initialSuppliers,
  companyId,
}: {
  initialSuppliers: Supplier[];
  companyId: string;
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [message, setMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(suppliers.map((supplier) => supplier.category))).sort()],
    [suppliers]
  );

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      const matchesCategory = categoryFilter === "All" || supplier.category === categoryFilter;
      const matchesRisk = riskFilter === "All" || supplier.risk_status === riskFilter;
      if (!matchesCategory || !matchesRisk) return false;
      if (!term) return true;
      return (
      [
        supplier.supplier_name,
        supplier.category,
        supplier.contact_email || "",
        supplier.invoice_email || "",
        supplier.risk_status,
        String(supplier.last_price_movement),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
      );
    });
  }, [suppliers, search, categoryFilter, riskFilter]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addSupplier() {
    if (!form.supplier_name.trim()) {
      setMessage("Please enter a supplier name.");
      return;
    }

    const payload = {
      company_id: companyId,
      supplier_name: form.supplier_name.trim(),
      category: form.category,
      contact_email: form.contact_email || null,
      invoice_email: form.invoice_email || null,
      risk_status: form.risk_status,
      last_price_movement: Number(form.last_price_movement),
    };

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_suppliers").insert(payload).select("*").single();
      if (error || !data) {
        setMessage(error?.message || "Could not save supplier.");
        return;
      }
      setSuppliers((current) => [...current, data as Supplier].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
    } else {
      setSuppliers((current) => [...current, { id: crypto.randomUUID(), ...payload } as Supplier].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
    }

    setForm(emptyForm);
    setMessage("Supplier added.");
  }

  async function deleteSupplier(id: string) {
    setSuppliers((current) => current.filter((item) => item.id !== id));
    if (supabase && !id.startsWith("supplier")) {
      await supabase.from("vyron_cost_suppliers").delete().eq("id", id);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-3 text-[#84CC16]"><Plus size={20} /></div>
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">Add New Supplier</h2>
            <p className="text-sm text-slate-500">Create suppliers and assign categories.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Supplier Name
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.supplier_name} onChange={(event) => updateForm("supplier_name", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Category
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Contact Email
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.contact_email} onChange={(event) => updateForm("contact_email", event.target.value)} />
          </label>

          <button type="button" onClick={addSupplier} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
            <Plus size={18} />
            Add Supplier
          </button>

          {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#7E22CE]">{message}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-[#F8FAFC]">Supplier Register</h2>
          <p className="mt-2 text-sm text-slate-500">Search suppliers by name, category, email, movement or risk.</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
            {["All", ...Array.from(new Set(suppliers.map((s) => s.risk_status)))].map((risk) => (
              <option key={risk}>{risk}</option>
            ))}
          </select>
        </div>

        <SearchFilterBar
          value={search}
          onChange={setSearch}
          placeholder="Search suppliers..."
          resultCount={filteredSuppliers.length}
        />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
              <div>Supplier</div><div>Category</div><div>Contact</div><div>Movement</div><div>Risk</div><div>Full Edit</div><div>Delete</div>
            </div>

            {filteredSuppliers.map((supplier) => (
              <div key={supplier.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                <div>
                  <Link href={`/suppliers/${supplier.id}`} className="font-black text-[#F8FAFC] hover:text-[#7E22CE]">
                    {supplier.supplier_name}
                  </Link>
                </div>
                <div className="font-bold text-slate-600">{supplier.category}</div>
                <div className="text-slate-500">{supplier.contact_email || "Not captured"}</div>
                <div className="font-black text-[#7E22CE]">{Number(supplier.last_price_movement).toFixed(1)}%</div>
                <div><StatusPill tone={statusTone(supplier.risk_status)}>{supplier.risk_status}</StatusPill></div>
                <div>
                  <Link href={`/suppliers/${supplier.id}/edit`} className="inline-flex items-center gap-2 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE]">
                    <Edit3 size={14} />
                    Edit
                  </Link>
                </div>
                <div>
                  <button type="button" onClick={() => deleteSupplier(supplier.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                    <Trash2 size={14} />
                    Delete
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
