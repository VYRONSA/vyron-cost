"use client";

import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { Link2, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BomHeader } from "@/lib/vyron-cost-bom-data";
import { calcGp, calcSuggestedPrice, CostProduct, formatMoney } from "@/lib/vyron-cost-product-data";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  product_name: "",
  product_category: "Handcrafted Pies",
  linked_bom_id: "",
  selling_price: "0",
  target_gp: "40",
  product_status: "Active",
};

export default function ProductManagerClient({ initialProducts, boms }: { initialProducts: CostProduct[]; boms: BomHeader[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const deleteConfirm = useConfirmDelete();

  const selectedBom = boms.find((bom) => bom.id === form.linked_bom_id) || null;
  const cost = Number(selectedBom?.cost_per_unit || 0);
  const selling = Number(form.selling_price || 0);
  const target = Number(form.target_gp || 0);
  const gp = calcGp(selling, cost);
  const suggested = calcSuggestedPrice(cost, target);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return products;
    return products.filter((product) => [product.product_name, product.product_category || product.category || "", product.product_status || ""].join(" ").toLowerCase().includes(term));
  }, [products, search]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setMessage("");
    setErrorMessage("");
    if (!form.product_name.trim()) {
      setErrorMessage("Product name is required.");
      return;
    }

    const payload = {
      product_name: form.product_name.trim(),
      category: form.product_category,
      product_category: form.product_category,
      linked_bom_id: form.linked_bom_id || null,
      selling_price: selling,
      total_cost: cost,
      target_gp: target,
      calculated_gp: gp,
      suggested_selling_price: suggested,
      product_status: form.product_status,
    };

    if (!supabase) {
      setProducts((current) => [...current, { id: crypto.randomUUID(), ...payload } as CostProduct]);
      setMessage("Saved locally in demo mode.");
      setForm(emptyForm);
      return;
    }

    const { data, error } = await supabase.from("vyron_cost_products").insert(payload).select("*").single();
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setProducts((current) => [...current, data as CostProduct].sort((a, b) => a.product_name.localeCompare(b.product_name)));
    setMessage("Product saved and linked to BOM.");
    setForm(emptyForm);
  }

  async function remove(id: string) {
    setProducts((current) => current.filter((product) => product.id !== id));
    if (supabase && !id.startsWith("demo")) await supabase.from("vyron_cost_products").delete().eq("id", id);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.75fr_1.35fr]">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Plus size={22} /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Add Finished Product</h2>
            <p className="text-sm font-semibold text-slate-500">Link product to BOM to calculate cost and GP.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <input value={form.product_name} onChange={(e) => update("product_name", e.target.value)} placeholder="Product Name" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <input value={form.product_category} onChange={(e) => update("product_category", e.target.value)} placeholder="Category" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <select value={form.linked_bom_id} onChange={(e) => update("linked_bom_id", e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none">
            <option value="">Choose BOM...</option>
            {boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.bom_name} — {formatMoney(bom.cost_per_unit)} / unit</option>)}
          </select>

          <div className="grid gap-4 md:grid-cols-3">
            <input type="number" value={form.selling_price} onChange={(e) => update("selling_price", e.target.value)} placeholder="Selling Price" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
            <input type="number" value={form.target_gp} onChange={(e) => update("target_gp", e.target.value)} placeholder="Target GP %" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
            <select value={form.product_status} onChange={(e) => update("product_status", e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none">
              <option>Active</option><option>Review</option><option>Archived</option>
            </select>
          </div>

          <div className="grid gap-3 rounded-3xl bg-slate-50 p-5 md:grid-cols-3">
            <div><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">BOM Cost</div><div className="mt-1 text-2xl font-black text-slate-900">{formatMoney(cost)}</div></div>
            <div><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Actual GP</div><div className={`mt-1 text-2xl font-black ${gp < target ? "text-red-600" : "text-emerald-600"}`}>{gp.toFixed(1)}%</div></div>
            <div><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Suggested</div><div className="mt-1 text-2xl font-black text-emerald-600">{formatMoney(suggested)}</div></div>
          </div>

          <button onClick={save} className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white">Save Finished Product</button>
          {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Finished Products</h2>
            <p className="text-sm font-semibold text-slate-500">Open products to review BOM, margin and suggested price.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <Search size={18} className="text-violet-700" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="w-64 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[240px_160px_160px_120px_120px_110px_120px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <div>Product</div><div>Category</div><div>BOM</div><div>Cost</div><div>Price</div><div>GP</div><div>Actions</div>
            </div>
            {filtered.map((product) => {
              const linked = boms.find((bom) => bom.id === product.linked_bom_id);
              const productGp = Number(product.calculated_gp || calcGp(Number(product.selling_price || 0), Number(product.total_cost || 0)));
              return (
                <div key={product.id} className="grid grid-cols-[240px_160px_160px_120px_120px_110px_120px] items-center border-t border-slate-100 px-5 py-4 text-sm">
                  <Link href={`/products/${product.id}`} className="font-black text-violet-700">{product.product_name}</Link>
                  <div className="font-bold text-slate-500">{product.product_category || product.category || "Uncategorised"}</div>
                  <div className="truncate font-bold text-violet-700">{linked?.bom_name || "Not linked"}</div>
                  <div className="font-black text-slate-900">{formatMoney(product.total_cost)}</div>
                  <div className="font-black text-slate-900">{formatMoney(product.selling_price)}</div>
                  <div className={`font-black ${productGp < Number(product.target_gp || 0) ? "text-red-600" : "text-emerald-600"}`}>{productGp.toFixed(1)}%</div>
                  <div className="flex gap-2">
                    <Link href={`/products/${product.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link>
                    <button onClick={() => deleteConfirm.requestDelete(() => remove(product.id))} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-3xl bg-violet-50 p-5">
          <div className="flex items-start gap-3">
            <Link2 className="mt-1 text-violet-700" size={22} />
            <p className="text-sm font-bold leading-6 text-violet-900">A product becomes powerful when linked to a BOM. Cost, GP and suggested price then update from the BOM.</p>
          </div>
        </div>
      </div>
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
