"use client";

import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { Link2, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BomHeader } from "@/lib/vyron-cost-bom-data";
import { calcGp, calcSuggestedPrice, CostProduct, demoProducts, formatMoney } from "@/lib/vyron-cost-product-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  VyronPremiumEmptyState,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

const emptyForm = {
  product_name: "",
  product_category: "General",
  linked_bom_id: "",
  selling_price: "0",
  target_gp: "40",
  product_status: "Active",
};

export default function ProductManagerClient({ initialProducts, boms }: { initialProducts: CostProduct[]; boms: BomHeader[] }) {
  const { canCreate, canEdit, canDelete } = useModulePermissions("products");
  const [products, setProducts] = useState<CostProduct[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const deleteConfirm = useConfirmDelete();

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    async function loadProducts() {
      if (!demo) {
        try {
          const response = await fetch("/api/products");
          const data = await response.json();
          if (data.ok && Array.isArray(data.products)) {
            setProducts(
              (data.products as CostProduct[]).filter(
                (p) => String(p.product_status || (p as { status?: string }).status || "Active") !== "Archived"
              )
            );
            return;
          }
        } catch {
          // fall through
        }
        setProducts([]);
        return;
      }
      setProducts(initialProducts.length ? initialProducts : demoProducts);
    }

    loadProducts().finally(() => setLoading(false));
  }, [initialProducts]);

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

  function edit(product: CostProduct) {
    setEditingId(product.id);
    setForm({
      product_name: product.product_name || "",
      product_category: product.product_category || product.category || "General",
      linked_bom_id: product.linked_bom_id || "",
      selling_price: String(product.selling_price || 0),
      target_gp: String(product.target_gp || 0),
      product_status: product.product_status || "Active",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setMessage("");
    setErrorMessage("");
    if (editingId ? !canEdit : !canCreate) {
      setErrorMessage("You do not have permission to save products.");
      return;
    }
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

    if (demoMode) {
      const local = { id: editingId || crypto.randomUUID(), ...payload } as CostProduct;
      setProducts((current) =>
        editingId ? current.map((p) => (p.id === editingId ? local : p)) : [...current, local]
      );
      setMessage("Product saved in demo mode.");
      setForm(emptyForm);
      setEditingId(null);
      return;
    }

    try {
      const response = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) {
        setErrorMessage(data.error || "Failed to save product.");
        return;
      }
      const saved = data.product as CostProduct;
      setProducts((current) =>
        editingId
          ? current.map((p) => (p.id === editingId ? saved : p))
          : [...current, saved].sort((a, b) => a.product_name.localeCompare(b.product_name))
      );
      setMessage("Product saved and linked to BOM.");
      setForm(emptyForm);
      setEditingId(null);
    } catch {
      setErrorMessage("Failed to save product.");
    }
  }

  async function remove(id: string) {
    if (!canDelete) {
      setErrorMessage("You do not have permission to archive products.");
      return;
    }
    if (!demoMode) {
      try {
        const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (response.status === 409 && data?.code === "PRODUCT_REFERENCED") {
          const refs = data.references || {};
          const reasons = [
            `BOM: ${Number(refs.bom || 0)}`,
            `Sales Orders: ${Number(refs.salesOrder || 0)}`,
            `Invoices: ${Number(refs.invoice || 0)}`,
            `Stock Movements: ${Number(refs.stockMovement || 0)}`,
            `Production Runs: ${Number(refs.productionRun || 0)}`,
          ].join("\n");

          const shouldArchive = window.confirm(
            `This product is referenced and cannot be deleted.\n\n${reasons}\n\nArchive instead?`
          );

          if (shouldArchive) {
            const archiveResponse = await fetch(`/api/products/${id}?mode=archive`, { method: "DELETE" });
            const archiveData = await archiveResponse.json();
            if (!archiveResponse.ok || !archiveData?.ok) {
              setErrorMessage(archiveData?.error || "Failed to archive product.");
              return;
            }
            setProducts((current) => current.filter((product) => product.id !== id));
            setMessage("Product archived.");
            return;
          }

          setErrorMessage(data.message || "Product is referenced and cannot be deleted.");
          return;
        }

        if (!data.ok) {
          setErrorMessage(data.error || "Failed to archive product.");
          return;
        }
      } catch {
        setErrorMessage("Failed to delete product.");
        return;
      }
    }
    setProducts((current) => current.filter((product) => product.id !== id));
    setMessage("Product deleted.");
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        badge: "Premium Product Workspace",
        title: "Product Costing",
        subtitle: "Link finished products to BOMs, monitor gross profit, target pricing and margin gaps before they erode wealth.",
        outcomes: [
          "See true cost per unit from linked BOMs",
          "Compare actual GP against target margin",
          "Spot under-priced products before they ship",
          "Protect margin with suggested selling prices",
        ],
        formulaEyebrow: "Margin",
        formulaTitle: "Product profitability formulas",
        formulas: [
          { label: "Gross Profit %", formula: "(Selling Price − Cost / Unit) ÷ Selling Price × 100" },
          { label: "Suggested Price", formula: "Cost / Unit ÷ (1 − Target GP%)" },
          { label: "Monthly Risk", formula: "GP gap × units sold per month" },
        ],
        intelligenceEyebrow: "Cost signals",
        intelligenceTitle: "What to watch",
        intelligenceItems: [
          { label: "BOM linkage", detail: "Products without a BOM cannot show true cost or GP discipline." },
          { label: "GP gap", detail: "When actual GP sits below target, margin is leaking on every sale." },
          { label: "Repricing signal", detail: "Use suggested price to protect target margin without guesswork." },
        ],
      }}
      showControlPanel={false}
    >
      <VyronPremiumSectionHeading eyebrow="Product master" title="Finished products" subtitle="Create, link and monitor product margin performance." />

      <div className={`grid min-w-0 max-w-full grid-cols-1 gap-6 ${canCreate || canEdit ? "xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]" : ""}`}>
      {canCreate || canEdit ? (
      <div className="min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Plus size={22} /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">{editingId ? "Edit Finished Product" : "Add Finished Product"}</h2>
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
            <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]">Actual GP</div><div className={`mt-1 text-2xl font-black ${gp < target ? "text-orange-400" : "text-[#A3E635]"}`}>{gp.toFixed(1)}%</div></div>
            <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]">Suggested</div><div className="mt-1 text-2xl font-black text-[#A3E635]">{formatMoney(suggested)}</div></div>
          </div>

          <button onClick={save} className="rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#F8FAFC]">Save Finished Product</button>
          {message && <div className="rounded-2xl border border-[#A3E635]/25 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#A3E635]">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
        </div>
      </div>
      ) : null}

      <div className="min-w-0 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
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
            {loading ? (
              <div className="border-t border-slate-100 px-5 py-10 text-center text-sm font-semibold text-slate-500">
                Loading products…
              </div>
            ) : filtered.length === 0 ? (
              <div className="border-t border-slate-100 p-5">
                <VyronPremiumEmptyState
                  steps={[
                    "Create a finished product and link it to a BOM.",
                    "Set selling price and target GP percentage.",
                    "Review actual GP against your margin goal.",
                    "Open product detail to analyse cost lines and repricing.",
                  ]}
                />
              </div>
            ) : null}
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
                  <div className={`font-black ${productGp < Number(product.target_gp || 0) ? "text-orange-400" : "text-[#A3E635]"}`}>{productGp.toFixed(1)}%</div>
                  <div className="flex gap-2">
                    {canEdit ? (
                      <button onClick={() => edit(product)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                    ) : null}
                    <Link href={`/products/${product.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Open</Link>
                    {canDelete ? (
                      <button onClick={() => deleteConfirm.requestDelete(() => remove(product.id))} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
                    ) : null}
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
