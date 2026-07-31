"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";
import { CostSupplier } from "@/lib/vyron-cost-core-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";

type SupplierForm = {
  supplier_name: string;
  category: string;
  contact_email: string;
  invoice_email: string;
  risk_status: string;
  last_price_movement: string;
};

function supplierToForm(item: CostSupplier): SupplierForm {
  return {
    supplier_name: item.supplier_name,
    category: item.category || "General",
    contact_email: item.contact_email || "",
    invoice_email: item.invoice_email || "",
    risk_status: item.risk_status || "Stable",
    last_price_movement: String(item.last_price_movement ?? 0),
  };
}

export default function SupplierEditPageClient({ supplier }: { supplier: CostSupplier }) {
  const router = useRouter();
  const { can } = useWorkspacePermissions();
  const canEdit = can("suppliers.edit");
  const canDelete = can("suppliers.delete");
  const [form, setForm] = useState<SupplierForm>(() => supplierToForm(supplier));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this supplier? This action cannot be undone.");
  const demoMode = isDemoWorkspace(readActiveClient());

  function updateForm(field: keyof SupplierForm, value: string) {
    if (!canEdit) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveSupplier() {
    if (!canEdit) {
      setMessage("You do not have permission to edit suppliers.");
      return;
    }
    if (!form.supplier_name.trim()) {
      setMessage("Please enter a supplier name.");
      return;
    }

    if (demoMode || supplier.id.startsWith("demo")) {
      setMessage("Supplier saved in demo mode.");
      return;
    }

    const payload = {
      supplier_name: form.supplier_name.trim(),
      category: form.category,
      contact_email: form.contact_email || null,
      invoice_email: form.invoice_email || null,
      risk_status: form.risk_status,
      last_price_movement: Number(form.last_price_movement),
    };

    const response = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) {
      setMessage(data.error || "Could not save supplier.");
      return;
    }

    setMessage("Supplier saved. Returning to suppliers...");
    setTimeout(() => router.push("/suppliers"), 450);
  }

  function requestDeleteSupplier() {
    if (!canDelete) {
      setMessage("You do not have permission to delete suppliers.");
      return;
    }
    deleteConfirm.requestDelete(async () => {
      if (demoMode || supplier.id.startsWith("demo")) {
        router.push("/suppliers");
        return;
      }
      const response = await fetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || "Could not delete supplier.");
        return;
      }
      router.push("/suppliers");
    });
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-violet-800 via-indigo-950 to-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(81,63,190,0.28)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#CBD5E1]">Premium Supplier Profile</div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] md:text-5xl">Supplier Intelligence Centre</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-violet-100">Review supplier risk, invoice routing, price movement and procurement stability before purchasing decisions affect margin.</p>
            <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Risk Status</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Invoice Email</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Price Movement</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Procurement Stability</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">Supplier Control</span>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">VYRON COST principle</div>
              <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;Suppliers do not just sell stock — they shape your margin.&rdquo;</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#CBD5E1]">Business intelligence</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">Every action on this page should improve cost visibility, margin control and financial trust.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
      <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[#F8FAFC]">Edit Supplier</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              Full supplier edit page for invoice routing, supplier risk and procurement data.
            </p>
          </div>

          <Link href="/suppliers" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
            ← Back
          </Link>
        </div>

        <div className="grid gap-5">
          <label className="text-sm font-black text-slate-600">
            Supplier Name
            <input
              disabled={!canEdit}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
              value={form.supplier_name}
              onChange={(event) => updateForm("supplier_name", event.target.value)}
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Category
              <select
                disabled={!canEdit}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
              >
                <option>Fresh Produce</option>
                <option>Dry Goods</option>
                <option>Meat & Poultry</option>
                <option>Packaging</option>
                <option>General</option>
              </select>
            </label>

            <label className="text-sm font-black text-slate-600">
              Risk Status
              <select
                disabled={!canEdit}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
                value={form.risk_status}
                onChange={(event) => updateForm("risk_status", event.target.value)}
              >
                <option>Stable</option>
                <option>Watch</option>
                <option>High Risk</option>
              </select>
            </label>
          </div>

          <label className="text-sm font-black text-slate-600">
            Contact Email
            <input
              disabled={!canEdit}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
              value={form.contact_email}
              onChange={(event) => updateForm("contact_email", event.target.value)}
            />
          </label>

          <label className="text-sm font-black text-slate-600">
            VYRON Invoice Email
            <input
              disabled={!canEdit}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
              value={form.invoice_email}
              onChange={(event) => updateForm("invoice_email", event.target.value)}
            />
          </label>

          <label className="text-sm font-black text-slate-600">
            Last Price Movement %
            <input
              type="number"
              disabled={!canEdit}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50"
              value={form.last_price_movement}
              onChange={(event) => updateForm("last_price_movement", event.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            {canEdit ? (
              <button type="button" onClick={saveSupplier} className="inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-6 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
                <Save size={18} />
                Save Supplier
              </button>
            ) : null}

            {canDelete ? (
              <button type="button" onClick={requestDeleteSupplier} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
                <Trash2 size={18} />
                Delete Supplier
              </button>
            ) : null}
          </div>

          {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-black text-[#7E22CE]">{message}</div>}
        </div>
      </div>

      <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A855F7]">
          SUPPLIER RISK INTELLIGENCE
        </div>

        <div className="mt-4 text-5xl font-black">{Number(form.last_price_movement || 0).toFixed(1)}%</div>

        <div className="mt-3 text-sm leading-7 text-slate-300">
          Last recorded supplier price movement. Large movements should be reviewed before new purchase orders, invoice approval or product pricing decisions.
        </div>

        <div className="mt-6 rounded-3xl border border-[#A855F7]/20 bg-white/5 p-5">
          <div className="text-sm font-black text-[#A855F7]">Invoice Routing</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            Suppliers can forward invoices to the VYRON COST invoice email for future AI extraction.
          </div>
        </div>
      </aside>
    </section>
      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </>
  );
}
