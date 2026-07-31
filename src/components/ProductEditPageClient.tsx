"use client";

import {
  Calculator,
  LineChart,
  PackageCheck,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ProductBOMManager from "@/components/ProductBOMManager";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import {
  buildProductCostFields,
  calculateGpPercent,
  calculateSuggestedPrice,
  formatMoney,
  Product,
  ProductCostLine,
} from "@/lib/vyron-cost-data";

type ProductForm = {
  product_name: string;
  category: string;
  selling_price: string;
  total_cost: string;
  target_gp: string;
  salary_cost: string;
  packaging_cost: string;
  overhead_cost: string;
  wastage_percent: string;
};

function productToForm(item: Product): ProductForm {
  return {
    product_name: item.product_name,
    category: item.category,
    selling_price: String(item.selling_price ?? 0),
    total_cost: String(item.total_cost ?? 0),
    target_gp: String(item.target_gp ?? 40),
    salary_cost: String(item.salary_cost ?? 0),
    packaging_cost: String(item.packaging_cost ?? 0),
    overhead_cost: String(item.overhead_cost ?? 0),
    wastage_percent: String(item.wastage_percent ?? 0),
  };
}

function premiumInputClass(canEdit: boolean) {
  return `mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 ${
    canEdit ? "bg-white" : "bg-slate-50 text-slate-500"
  }`;
}

function labelClass() {
  return "text-xs font-black uppercase tracking-[0.14em] text-slate-500";
}

export default function ProductEditPageClient({
  product,
  costLines,
  companyId,
}: {
  product: Product;
  costLines: ProductCostLine[];
  companyId: string;
}) {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = useModulePermissions("products");
  const { canEdit: canEditBom } = useModulePermissions("boms");
  const canEditCostLines = canEdit || canEditBom;
  const [form, setForm] = useState<ProductForm>(() => productToForm(product));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this product? This action cannot be undone.");

  const gpPreview = useMemo(() => {
    return calculateGpPercent(Number(form.selling_price), Number(form.total_cost));
  }, [form.selling_price, form.total_cost]);

  const suggestedPrice = useMemo(() => {
    return calculateSuggestedPrice(Number(form.total_cost), Number(form.target_gp));
  }, [form.total_cost, form.target_gp]);

  const marginGap = Number(form.target_gp || 0) - gpPreview;
  const isBelowTarget = gpPreview < Number(form.target_gp || 0);
  const inputClass = premiumInputClass(canEdit);
  const label = labelClass();

  function updateForm(field: keyof ProductForm, value: string) {
    if (!canEdit) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProduct() {
    if (!canEdit) {
      setMessage("You do not have permission to edit products.");
      return;
    }
    if (!form.product_name.trim()) {
      setMessage("Please enter a product name.");
      return;
    }

    const selling = Number(form.selling_price);
    const cost = Number(form.total_cost);
    const target = Number(form.target_gp);
    const derived = buildProductCostFields(selling, target, cost);

    const payload = {
      product_name: form.product_name.trim(),
      category: form.category,
      selling_price: selling,
      total_cost: cost,
      target_gp: target,
      salary_cost: Number(form.salary_cost),
      packaging_cost: Number(form.packaging_cost),
      overhead_cost: Number(form.overhead_cost),
      wastage_percent: Number(form.wastage_percent),
      calculated_gp: derived.calculated_gp,
      suggested_selling_price: derived.suggested_selling_price,
    };

    if (companyId === "demo-company" || product.id.startsWith("product")) {
      setMessage("Product saved.");
      return;
    }

    const response = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) {
      setMessage(data.error || "Could not save product.");
      return;
    }

    setMessage("Product saved.");
  }

  async function archiveProduct() {
    if (!canDelete) {
      setMessage("You do not have permission to archive products.");
      return;
    }

    const response = await fetch(`/api/products/${product.id}?mode=archive`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      setMessage(data.error || "Could not archive product.");
      return;
    }
    router.push("/products");
  }

  async function duplicateProduct() {
    if (!canCreate) {
      setMessage("You do not have permission to duplicate products.");
      return;
    }

    const sourceName = String(form.product_name || product.product_name || "Product").trim();
    const linkedBomId = (product as Product & { linked_bom_id?: string | null }).linked_bom_id || null;

    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: `${sourceName} Copy`,
        product_category: form.category,
        linked_bom_id: linkedBomId,
        selling_price: Number(form.selling_price),
        total_cost: Number(form.total_cost),
        target_gp: Number(form.target_gp),
        product_status: "Active",
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok || !data.product?.id) {
      setMessage(data.error || "Could not duplicate product.");
      return;
    }

    router.push(`/products/${data.product.id}/edit`);
  }

  function requestDeleteProduct() {
    if (!canDelete) {
      setMessage("You do not have permission to delete products.");
      return;
    }
    deleteConfirm.requestDelete(async () => {
      if (!product.id.startsWith("product")) {
        const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
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
          if (!shouldArchive) {
            setMessage(data.message || "Product is referenced and cannot be deleted.");
            return;
          }

          const archiveResponse = await fetch(`/api/products/${product.id}?mode=archive`, { method: "DELETE" });
          const archiveData = await archiveResponse.json();
          if (!archiveResponse.ok || !archiveData.ok) {
            setMessage(archiveData.error || "Could not archive product.");
            return;
          }
          router.push("/products");
          return;
        }
        if (!data.ok) {
          setMessage(data.error || "Could not delete product.");
          return;
        }
      }
      router.push("/products");
    });
  }

  const liveProduct: Product = {
    ...product,
    product_name: form.product_name,
    category: form.category,
    selling_price: Number(form.selling_price),
    total_cost: Number(form.total_cost),
    target_gp: Number(form.target_gp),
    salary_cost: Number(form.salary_cost),
    packaging_cost: Number(form.packaging_cost),
    overhead_cost: Number(form.overhead_cost),
    wastage_percent: Number(form.wastage_percent),
  };

  return (
    <section className="grid gap-8">
      <section className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-violet-800 via-indigo-900 to-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(81,63,190,0.28)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#A855F7]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#CBD5E1]">
              <Sparkles size={15} /> Product Profitability Centre
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              Protect margin before it reaches the invoice.
            </h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-violet-100">
              Manage selling price, true product cost, target gross profit, packaging, labour, overheads and wastage from one premium costing workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {["Cost Price", "Selling Price", "Target GP", "BOM Drivers", "Margin Risk"].map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white/90">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A855F7]">Margin discipline</div>
              <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;Revenue is vanity. Margin is sanity.&rdquo;</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Cost intelligence</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">
                Small cost leaks become large profit problems when products scale across stores, batches and invoices.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Selling Price", value: formatMoney(Number(form.selling_price)), icon: TrendingUp, tone: "bg-white text-slate-950" },
          { label: "Cost Price", value: formatMoney(Number(form.total_cost)), icon: Calculator, tone: "bg-violet-50 text-violet-800" },
          { label: "Actual GP", value: `${gpPreview.toFixed(1)}%`, icon: LineChart, tone: isBelowTarget ? "bg-red-50 text-red-700" : "bg-[#A855F7]/10 text-[#7E22CE]" },
          { label: "Suggested Price", value: formatMoney(suggestedPrice), icon: Target, tone: "bg-[#A855F7]/10 text-[#4D7C0F]" },
        ].map((card) => (
          <div key={card.label} className={`rounded-[2rem] p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] ${card.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{card.label}</div>
              <card.icon size={20} className="opacity-70" />
            </div>
            <div className="mt-3 text-3xl font-black">{card.value}</div>
          </div>
        ))}
      </section>

      {isBelowTarget && Number(form.selling_price || 0) > 0 ? (
        <div className="rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-4 text-sm font-semibold text-[var(--vyron-warning-fg)]">
          Margin warning: actual GP is <span className="font-black">{marginGap.toFixed(1)}%</span> below target. Review price, product cost, packaging, labour or wastage before approving this product.
        </div>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[1.08fr_0.72fr]">
        <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_18px_55px_rgba(81,63,190,0.08)]">
          <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <PackageCheck size={24} />
              </div>
              <div>
                <div className={label}>Section 1</div>
                <h2 className="text-3xl font-black text-slate-950">Product Setup</h2>
                <p className="mt-2 text-sm font-semibold leading-7 text-slate-500">
                  Define the commercial product, selling price and costing assumptions used by VYRON COST.
                </p>
              </div>
            </div>

            <Link href="/products" className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-5 py-3 text-sm font-black text-violet-800">
              ← Back
            </Link>
          </div>

          <div className="grid gap-5">
            <label className={label}>
              Product Name
              <input disabled={!canEdit} className={inputClass} value={form.product_name} onChange={(event) => updateForm("product_name", event.target.value)} />
              <p className="mt-2 text-xs font-semibold normal-case tracking-normal text-slate-500">The finished product name shown on product lists, costing reports and invoice workflows.</p>
            </label>

            <label className={label}>
              Category
              <select disabled={!canEdit} className={inputClass} value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                <option>Sushi</option>
                <option>Bowls</option>
                <option>Ready Meals</option>
                <option>Packaging</option>
                <option>Other</option>
              </select>
              <p className="mt-2 text-xs font-semibold normal-case tracking-normal text-slate-500">Groups similar products for GP analysis, reporting and executive dashboards.</p>
            </label>

            <div className="grid gap-5 md:grid-cols-3">
              <label className={label}>
                Selling Price
                <input type="number" disabled={!canEdit} className={inputClass} value={form.selling_price} onChange={(event) => updateForm("selling_price", event.target.value)} />
                <p className="mt-2 text-xs font-semibold normal-case tracking-normal text-slate-500">Current customer selling price per finished unit.</p>
              </label>

              <label className={label}>
                Cost Price
                <input type="number" disabled={!canEdit} className={inputClass} value={form.total_cost} onChange={(event) => updateForm("total_cost", event.target.value)} />
                <p className="mt-2 text-xs font-semibold normal-case tracking-normal text-slate-500">True cost per unit, including BOM and direct cost drivers.</p>
              </label>

              <label className={label}>
                Target GP %
                <input type="number" disabled={!canEdit} className={inputClass} value={form.target_gp} onChange={(event) => updateForm("target_gp", event.target.value)} />
                <p className="mt-2 text-xs font-semibold normal-case tracking-normal text-slate-500">Your desired gross profit target for this product.</p>
              </label>
            </div>
          </div>
        </div>

        <aside className="grid gap-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-[#A855F7]/10" />
            <div className="relative">
              <Calculator size={30} className="text-[#A855F7]" />
              <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#A855F7]">Product Intelligence</div>
              <div className="mt-3 text-5xl font-black">{gpPreview.toFixed(1)}%</div>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                Current gross profit based on selling price and true cost price.
              </p>
              <div className="mt-6 rounded-3xl border border-[#A855F7]/20 bg-white/5 p-5">
                <div className="text-sm font-black text-[#A855F7]">Suggested Selling Price</div>
                <div className="mt-2 text-3xl font-black">{formatMoney(suggestedPrice)}</div>
                <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">Price needed to reach the selected target GP.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Formula</div>
            <h3 className="mt-2 text-xl font-black text-slate-950">How VYRON Calculates GP</h3>
            <div className="mt-4 rounded-2xl border border-violet-100 bg-white p-4 text-sm font-bold leading-7 text-slate-700">
              <p>GP % =</p>
              <p className="mt-1 text-lg font-black text-violet-800">(Selling Price − Cost Price) ÷ Selling Price × 100</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-fuchsia-700 via-violet-800 to-slate-950 p-6 text-white shadow-[0_18px_55px_rgba(81,63,190,0.2)]">
            <div className="pointer-events-none absolute -right-10 top-8 h-36 w-36 rounded-full border border-white/10" />
            <ShieldCheck size={26} className="text-[#A855F7]" />
            <div className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-200">Cost intelligence tip</div>
            <p className="mt-3 text-lg font-black leading-snug">What gets measured gets protected.</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-violet-100">
              A small increase in ingredients, labour or packaging can quietly erode margin across every invoice.
            </p>
          </div>
        </aside>
      </section>

      <section className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_18px_55px_rgba(81,63,190,0.08)]">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/12 text-[#7E22CE]">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className={label}>Section 2</div>
            <h2 className="text-2xl font-black text-slate-950">Direct Cost Drivers</h2>
            <p className="mt-2 text-sm font-semibold leading-7 text-slate-500">
              Separate cost drivers make it easier to explain GP movement and protect product profitability.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-4">
          <label className={label}>
            Packaging Cost
            <input type="number" disabled={!canEdit} className={inputClass} value={form.packaging_cost} onChange={(event) => updateForm("packaging_cost", event.target.value)} />
          </label>

          <label className={label}>
            Salary Cost
            <input type="number" disabled={!canEdit} className={inputClass} value={form.salary_cost} onChange={(event) => updateForm("salary_cost", event.target.value)} />
          </label>

          <label className={label}>
            Overhead Cost
            <input type="number" disabled={!canEdit} className={inputClass} value={form.overhead_cost} onChange={(event) => updateForm("overhead_cost", event.target.value)} />
          </label>

          <label className={label}>
            Wastage %
            <input type="number" disabled={!canEdit} className={inputClass} value={form.wastage_percent} onChange={(event) => updateForm("wastage_percent", event.target.value)} />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {canEdit ? (
            <button type="button" onClick={saveProduct} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_30px_rgba(29,107,255,0.28)] transition hover:from-violet-800 hover:to-fuchsia-700">
              <Save size={18} />
              Save Product
            </button>
          ) : null}

          {canCreate ? (
            <button type="button" onClick={duplicateProduct} className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-6 py-4 text-sm font-black text-violet-800 transition hover:bg-violet-100">
              Duplicate Product
            </button>
          ) : null}

          {canDelete ? (
            <button type="button" onClick={archiveProduct} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-6 py-4 text-sm font-black text-[var(--vyron-warning-fg)] transition hover:bg-[var(--vyron-warning-bg)]">
              Archive Product
            </button>
          ) : null}

          {canDelete ? (
            <button type="button" onClick={requestDeleteProduct} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
              <Trash2 size={18} />
              Delete Product
            </button>
          ) : null}
        </div>

        {message && <div className="mt-5 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-black text-[#7E22CE]">{message}</div>}
      </section>

      <section className="rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-7 shadow-[0_18px_55px_rgba(81,63,190,0.08)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl vyron-grad-surface text-white">
              <LineChart size={24} />
            </div>
            <div>
              <div className={label}>Section 3</div>
              <h2 className="text-2xl font-black text-slate-950">Product Cost Structure</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-600">
                Every cost line below contributes to the final cost price, GP percentage and suggested selling price. This is where VYRON turns operational detail into financial intelligence.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ProductBOMManager
        product={liveProduct}
        initialLines={costLines}
        companyId={companyId}
        readOnly={!canEditCostLines}
      />
      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </section>
  );
}
