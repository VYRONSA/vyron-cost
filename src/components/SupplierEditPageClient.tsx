"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Supplier } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

type SupplierForm = {
  supplier_name: string;
  category: string;
  contact_email: string;
  invoice_email: string;
  risk_status: string;
  last_price_movement: string;
};

function supplierToForm(item: Supplier): SupplierForm {
  return {
    supplier_name: item.supplier_name,
    category: item.category,
    contact_email: item.contact_email || "",
    invoice_email: item.invoice_email || "",
    risk_status: item.risk_status,
    last_price_movement: String(item.last_price_movement ?? 0),
  };
}

export default function SupplierEditPageClient({
  supplier,
  companyId,
}: {
  supplier: Supplier;
  companyId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SupplierForm>(() => supplierToForm(supplier));
  const [message, setMessage] = useState("");

  function updateForm(field: keyof SupplierForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveSupplier() {
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

    if (supabase && companyId !== "demo-company" && !supplier.id.startsWith("supplier")) {
      const { error } = await supabase
        .from("vyron_cost_suppliers")
        .update(payload)
        .eq("id", supplier.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Supplier saved. Returning to suppliers...");
    setTimeout(() => router.push("/suppliers"), 450);
  }

  async function deleteSupplier() {
    if (supabase && !supplier.id.startsWith("supplier")) {
      await supabase.from("vyron_cost_suppliers").delete().eq("id", supplier.id);
    }

    router.push("/suppliers");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
      <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[#07110d]">Edit Supplier</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              Full supplier edit page for invoice routing, supplier risk and procurement data.
            </p>
          </div>

          <Link href="/suppliers" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
            <ArrowLeft size={16} />
            Back to Suppliers
          </Link>
        </div>

        <div className="grid gap-5">
          <label className="text-sm font-black text-slate-600">
            Supplier Name
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.supplier_name} onChange={(event) => updateForm("supplier_name", event.target.value)} />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Category
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                <option>Fresh Produce</option>
                <option>Dry Goods</option>
                <option>Meat & Poultry</option>
                <option>Packaging</option>
                <option>General</option>
              </select>
            </label>

            <label className="text-sm font-black text-slate-600">
              Risk Status
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.risk_status} onChange={(event) => updateForm("risk_status", event.target.value)}>
                <option>Stable</option>
                <option>Watch</option>
                <option>High Risk</option>
              </select>
            </label>
          </div>

          <label className="text-sm font-black text-slate-600">
            Contact Email
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.contact_email} onChange={(event) => updateForm("contact_email", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            VYRON Invoice Email
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.invoice_email} onChange={(event) => updateForm("invoice_email", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Last Price Movement %
            <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.last_price_movement} onChange={(event) => updateForm("last_price_movement", event.target.value)} />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={saveSupplier} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-[#07110d] transition hover:bg-emerald-400">
              <Save size={18} />
              Save Supplier
            </button>

            <button type="button" onClick={deleteSupplier} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
              <Trash2 size={18} />
              Delete Supplier
            </button>
          </div>

          {message && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{message}</div>}
        </div>
      </div>

      <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
          SUPPLIER INTELLIGENCE
        </div>

        <div className="mt-4 text-5xl font-black">{Number(form.last_price_movement || 0).toFixed(1)}%</div>

        <div className="mt-3 text-sm leading-7 text-slate-300">
          Last recorded supplier movement. This will drive procurement warnings and product GP risk.
        </div>

        <div className="mt-6 rounded-3xl border border-emerald-400/15 bg-white/5 p-5">
          <div className="text-sm font-black text-emerald-300">Invoice Routing</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            Suppliers can forward invoices to the VYRON COST invoice email for future AI extraction.
          </div>
        </div>
      </aside>
    </section>
  );
}
