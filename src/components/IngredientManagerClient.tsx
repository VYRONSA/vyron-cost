"use client";

import { Plus, Save, Search, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateMovementPercent, calculateTrueUnitCost, CostIngredient, CostSupplier, demoIngredients, demoSuppliers, formatMoney } from "@/lib/vyron-cost-core-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_DOMAIN_INTELLIGENCE, VYRON_DOMAIN_QUOTES } from "@/components/vyron-premium/VyronPremiumTheme";

const emptyForm = {
  ingredient_name: "",
  category: "Uncategorised",
  supplier_id: "",
  purchase_unit: "kg",
  recipe_unit: "kg",
  purchase_cost: "0",
  previous_cost: "0",
  yield_type: "Standard",
  yield_percent: "100",
  current_alert: "",
};

export default function IngredientManagerClient({ initialIngredients, suppliers: initialSuppliersProp }: { initialIngredients: CostIngredient[]; suppliers: CostSupplier[] }) {
  const { canCreate, canEdit, canDelete } = useModulePermissions("ingredients");
  const [ingredients, setIngredients] = useState<CostIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<CostSupplier[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CostIngredient | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    async function loadData() {
      if (!demo) {
        try {
          const [ingredientsRes, suppliersRes] = await Promise.all([
            fetch("/api/ingredients"),
            fetch("/api/suppliers"),
          ]);
          const ingredientsData = await ingredientsRes.json();
          const suppliersData = await suppliersRes.json();
          if (ingredientsData.ok && Array.isArray(ingredientsData.ingredients)) {
            setIngredients(ingredientsData.ingredients as CostIngredient[]);
          } else {
            setIngredients([]);
          }
          if (suppliersData.ok && Array.isArray(suppliersData.suppliers)) {
            setSuppliers(suppliersData.suppliers as CostSupplier[]);
          } else {
            setSuppliers([]);
          }
          return;
        } catch {
          setIngredients([]);
          setSuppliers([]);
          return;
        }
      }

      setIngredients(initialIngredients.length ? initialIngredients : demoIngredients);
      setSuppliers(initialSuppliersProp.length ? initialSuppliersProp : demoSuppliers);
    }

    loadData().finally(() => setLoading(false));
  }, [initialIngredients, initialSuppliersProp]);

  const trueCost = calculateTrueUnitCost(Number(form.purchase_cost || 0), Number(form.yield_percent || 100));
  const movement = calculateMovementPercent(Number(form.previous_cost || 0), Number(form.purchase_cost || 0));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter((i) =>
      [i.ingredient_name, i.category || "", i.current_alert || ""].join(" ").toLowerCase().includes(term)
    );
  }, [ingredients, search]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function edit(item: CostIngredient) {
    setEditingId(item.id);
    setForm({
      ingredient_name: item.ingredient_name || "",
      category: item.category || "Uncategorised",
      supplier_id: item.supplier_id || "",
      purchase_unit: item.purchase_unit || "kg",
      recipe_unit: item.recipe_unit || "kg",
      purchase_cost: String(item.purchase_cost || 0),
      previous_cost: String(item.previous_cost || 0),
      yield_type: item.yield_type || "Standard",
      yield_percent: String(item.yield_percent || 100),
      current_alert: item.current_alert || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setMessage("");
    setErrorMessage("");

    if (editingId ? !canEdit : !canCreate) {
      setErrorMessage("You do not have permission to save ingredients.");
      return;
    }

    if (!form.ingredient_name.trim()) {
      setErrorMessage("Ingredient name is required.");
      return;
    }

    const payload = {
      ingredient_name: form.ingredient_name.trim(),
      category: form.category || "Uncategorised",
      supplier_id: form.supplier_id || null,
      purchase_unit: form.purchase_unit || "kg",
      recipe_unit: form.recipe_unit || "kg",
      purchase_cost: Number(form.purchase_cost || 0),
      previous_cost: Number(form.previous_cost || 0),
      yield_type: form.yield_type || "Standard",
      yield_percent: Number(form.yield_percent || 100),
      true_unit_cost: trueCost,
      current_alert: form.current_alert || null,
      updated_at: new Date().toISOString(),
    };

    if (demoMode) {
      const local = { id: editingId || crypto.randomUUID(), ...payload } as CostIngredient;
      setIngredients((current) =>
        editingId ? current.map((i) => (i.id === editingId ? local : i)) : [...current, local]
      );
      setForm(emptyForm);
      setEditingId(null);
      setMessage("Ingredient saved in demo mode.");
      return;
    }

    try {
      const response = await fetch(editingId ? `/api/ingredients/${editingId}` : "/api/ingredients", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) {
        setErrorMessage(data.error || "Failed to save ingredient.");
        return;
      }
      const saved = data.ingredient as CostIngredient;
      setIngredients((current) =>
        editingId
          ? current.map((i) => (i.id === editingId ? saved : i))
          : [...current, saved].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name))
      );
      setForm(emptyForm);
      setEditingId(null);
      const cascade = data.cascade as { bomCount?: number; productCount?: number } | undefined;
      if (cascade?.bomCount) {
        setMessage(
          `Ingredient saved. ${cascade.bomCount} BOM(s) and ${cascade.productCount || 0} product(s) recalculated.`
        );
      } else {
        setMessage("Ingredient saved.");
      }
    } catch {
      setErrorMessage("Failed to save ingredient.");
    }
  }

  async function remove(id: string) {
    if (!canDelete) {
      setErrorMessage("You do not have permission to delete ingredients.");
      return;
    }
    setDeleting(true);
    try {
      if (!demoMode) {
        const response = await fetch(`/api/ingredients/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!data.ok) {
          setErrorMessage(data.error || "Failed to delete ingredient.");
          return;
        }
      }
      setIngredients((current) => current.filter((i) => i.id !== id));
      setMessage("Ingredient deleted.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-400";
  const labelClass = "text-xs font-black uppercase tracking-[0.08em] text-slate-500";

  const ingredientQuotes = VYRON_DOMAIN_QUOTES.ingredients;

  return (
    <>
      <VyronPremiumPageShell
        config={{
          visualVariant: "ingredients",
          badge: "Premium Ingredient Workspace",
          title: "Ingredient Costing",
          subtitle: "Monitor supplier inflation, yield efficiency, true unit cost and recipe impact before small increases become major margin leakage.",
          outcomes: ["True Cost", "Yield %", "Supplier Link", "BOM Impact", "Cost Movement"],
          quotes: ingredientQuotes,
          controlTitle: "Ingredient Control",
          formulaEyebrow: "True Cost Formula",
          formulaTitle: "Ingredient economics",
          formulas: [
            { label: "True Unit Cost", formula: "Purchase Cost ÷ (Yield % ÷ 100)" },
            { label: "Movement %", formula: "(Current − Previous) ÷ Previous × 100" },
            { label: "BOM Impact", formula: "Ingredient qty × true unit cost per batch" },
          ],
          intelligenceEyebrow: "Cost signals",
          intelligenceTitle: "What to watch",
          intelligenceItems: VYRON_DOMAIN_INTELLIGENCE.ingredients,
        }}
      >
      <section className={`grid min-w-0 max-w-full grid-cols-1 gap-5 ${canCreate || canEdit ? "xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]" : ""}`}>
      {canCreate || canEdit ? (
      <div className="min-w-0 rounded-[1.75rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Plus size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-950">{editingId ? "Edit Ingredient" : "Add Ingredient"}</h2>
            <p className="text-xs font-semibold text-slate-500">Only fill in what is needed.</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-violet-400/20 bg-violet-600/10 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">True Unit Cost</div>
            <div className="mt-1 text-3xl font-black text-violet-300">{formatMoney(trueCost)}</div>
          </div>
          <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/8 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">Movement</div>
            <div className={`mt-1 text-3xl font-black ${movement > 5 ? "text-[var(--vyron-warning-fg)]" : "text-[#A855F7]"}`}>{movement.toFixed(1)}%</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">1. Basic</div>
            <div className="grid gap-3">
              <label>
                <div className={labelClass}>Ingredient Name *</div>
                <input value={form.ingredient_name} onChange={(e) => update("ingredient_name", e.target.value)} placeholder="Example: All spice" className={inputClass} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className={labelClass}>Category *</div>
                  <input value={form.category} onChange={(e) => update("category", e.target.value)} placeholder="Spices" className={inputClass} />
                </label>
                <label>
                  <div className={labelClass}>Supplier *</div>
                  <select value={form.supplier_id} onChange={(e) => update("supplier_id", e.target.value)} className={inputClass}>
                    <option value="">Choose...</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">2. Cost</div>
            <div className="grid grid-cols-3 gap-3">
              <label>
                <div className={labelClass}>Supplier Cost *</div>
                <input type="number" value={form.purchase_cost} onChange={(e) => update("purchase_cost", e.target.value)} placeholder="215.80" className={inputClass} />
              </label>
              <label>
                <div className={labelClass}>Previous</div>
                <input type="number" value={form.previous_cost} onChange={(e) => update("previous_cost", e.target.value)} placeholder="198.50" className={inputClass} />
              </label>
              <label>
                <div className={labelClass}>Yield % *</div>
                <input type="number" value={form.yield_percent} onChange={(e) => update("yield_percent", e.target.value)} placeholder="100" className={inputClass} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">3. Units</div>
            <div className="grid grid-cols-3 gap-3">
              <label>
                <div className={labelClass}>Supplier Unit *</div>
                <input value={form.purchase_unit} onChange={(e) => update("purchase_unit", e.target.value)} placeholder="kg" className={inputClass} />
              </label>
              <label>
                <div className={labelClass}>Recipe Unit *</div>
                <input value={form.recipe_unit} onChange={(e) => update("recipe_unit", e.target.value)} placeholder="g" className={inputClass} />
              </label>
              <label>
                <div className={labelClass}>Yield Type</div>
                <select value={form.yield_type} onChange={(e) => update("yield_type", e.target.value)} className={inputClass}>
                  <option>Standard</option>
                  <option>Trim Loss</option>
                  <option>Cook Loss</option>
                  <option>Drain Loss</option>
                  <option>Weight Gain</option>
                  <option>Weight Loss</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">4. Notes</div>
            <input value={form.current_alert} onChange={(e) => update("current_alert", e.target.value)} placeholder="Imported from invoice / Excel / PDF" className={inputClass} />
          </div>

          <details className="rounded-2xl bg-violet-50 p-4">
            <summary className="cursor-pointer text-sm font-black text-violet-800">Need help?</summary>
            <div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-600">
              <p><b>Supplier Cost:</b> invoice price excluding VAT.</p>
              <p><b>Previous Cost:</b> last supplier price for movement.</p>
              <p><b>Yield %:</b> 100 no loss, 95 means 5% loss.</p>
              <p><b>Units:</b> buy in kg, use in g.</p>
            </div>
          </details>

          <button onClick={save} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-transparent vyron-grad-surface px-5 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#F8FAFC]">
            <Save size={18} />
            Save Ingredient
          </button>

          {message && <div className="rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#A855F7]">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}
        </div>
      </div>
      ) : null}

      <div className="min-w-0 rounded-[1.75rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Ingredients</h2>
            <p className="text-xs font-semibold text-slate-500">Open, edit or delete.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <Search size={18} className="text-violet-700" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="min-w-0 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 md:w-52" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[220px_130px_110px_110px_90px_110px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              <div>Ingredient</div><div>Category</div><div>Cost</div><div>True</div><div>Move</div><div>Actions</div>
            </div>
            {loading ? (
              <div className="border-t border-slate-100 px-5 py-10 text-center text-sm font-semibold text-slate-500">
                Loading ingredients…
              </div>
            ) : filtered.length === 0 ? (
              <div className="border-t border-slate-100 px-5 py-10 text-center text-sm font-semibold text-slate-500">
                No ingredients yet. Start by adding ingredients, linking suppliers, then build BOMs so VYRON can protect your product margins.
              </div>
            ) : null}
            {filtered.map((item) => {
              const move = calculateMovementPercent(Number(item.previous_cost || 0), Number(item.purchase_cost || 0));
              return (
                <div key={item.id} className="grid grid-cols-[220px_130px_110px_110px_90px_110px] items-center border-t border-slate-100 px-5 py-4 text-sm">
                  <Link href={`/ingredients/${item.id}`} className="font-black text-violet-700">{item.ingredient_name}</Link>
                  <div className="font-bold text-slate-500">{item.category}</div>
                  <div className="font-black text-slate-900">{formatMoney(item.purchase_cost)}</div>
                  <div className="font-black text-violet-700">{formatMoney(item.true_unit_cost)}</div>
                  <div className={`font-black ${move > 5 ? "text-[var(--vyron-warning-fg)]" : "text-[#A855F7]"}`}>{move.toFixed(1)}%</div>
                  <div className="flex gap-2">
                    {canEdit ? (
                      <button onClick={() => edit(item)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                    ) : null}
                    {canDelete ? (
                      <button onClick={() => setDeleteTarget(item)} className="rounded-xl bg-red-50 p-2 text-red-700"><Trash2 size={16} /></button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
      </VyronPremiumPageShell>

    <ConfirmDeleteDialog
      open={!!deleteTarget}
      confirming={deleting}
      message={`Are you sure you want to delete ${deleteTarget?.ingredient_name || "this ingredient"}? This action cannot be undone.`}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => deleteTarget ? void remove(deleteTarget.id) : undefined}
    />
    </>
  );
}
