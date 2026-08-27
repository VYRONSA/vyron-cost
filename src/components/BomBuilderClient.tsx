"use client";

import { ArrowRight, Boxes, Calculator, Layers, Plus, Save, Sparkles, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FieldHint, VyronFieldGuide } from "@/components/VyronFieldGuide";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { BomHeader, BomLine, calcGp, calcLineCost, calcSuggestedPrice, formatMoney } from "@/lib/vyron-cost-bom-data";
import { recipeLineToBomLine, recipeToBomHeader } from "@/lib/vyron-cost-recipes-data";
import { CostIngredient } from "@/lib/vyron-cost-core-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { ItemLookupField } from "@/components/vyron-platform/item-lookup/ItemLookupField";
import type { ItemLookupResult } from "@/lib/platform/item-lookup/ItemLookupTypes";

type DraftLine = Omit<BomLine, "id" | "bom_id" | "line_cost"> & { temp_id: string };
type ProductOption = { id: string; product_name: string };

const lineTypes = ["Ingredient", "Packaging", "Labour", "Overhead", "Wastage"];

const bomFieldGuide = [
  {
    title: "BOM / Recipe Name",
    icon: "tag" as const,
    description: "The costing structure name used across recipes, products and reports.",
    example: "Chicken Pie Batch, All Spice Blend",
  },
  {
    title: "Yield Quantity",
    icon: "ruler" as const,
    description: "How many finished units this BOM produces in one batch.",
    example: "24 pies, 10 kg, 1 batch",
  },
  {
    title: "Target GP %",
    icon: "percent" as const,
    description: "The gross profit percentage you want to achieve on this product.",
    example: "40% food manufacturing, 55% retail",
  },
  {
    title: "Linked Product",
    icon: "package" as const,
    description: "Optionally connect this BOM to a finished product so costs sync automatically on save.",
    example: "Handcrafted Chicken Pie",
  },
];

function newLine(sortOrder: number, type = "Ingredient"): DraftLine {
  return {
    temp_id: crypto.randomUUID(),
    line_type: type,
    ingredient_id: null,
    line_name: type === "Ingredient" ? "" : type,
    quantity: 0,
    unit: type === "Packaging" ? "unit" : type === "Labour" ? "hour" : type === "Overhead" ? "batch" : "kg",
    unit_cost: 0,
    wastage_percent: 0,
    sort_order: sortOrder,
  };
}

export default function BomBuilderClient({
  ingredients: initialIngredients,
  existingBom,
  existingLines,
  recipeId,
}: {
  ingredients: CostIngredient[];
  existingBom?: BomHeader | null;
  existingLines?: BomLine[];
  recipeId?: string;
}) {
  const router = useRouter();
  const { canCreate, canEdit } = useModulePermissions("boms");
  const resolvedRecipeId = existingBom?.id || recipeId || "";
  const isEdit = Boolean(resolvedRecipeId && !resolvedRecipeId.startsWith("demo"));
  const canSave = isEdit ? canEdit : canCreate;
  const readOnly = !canSave;
  const [demoMode, setDemoMode] = useState(false);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [bomName, setBomName] = useState(existingBom?.bom_name || "");
  const [category, setCategory] = useState(existingBom?.category || "General");
  const [yieldQty, setYieldQty] = useState(String(existingBom?.yield_qty || 1));
  const [yieldUnit, setYieldUnit] = useState(existingBom?.yield_unit || "unit");
  const [targetGp, setTargetGp] = useState(String(existingBom?.target_gp || 40));
  const [sellingPrice, setSellingPrice] = useState(String(existingBom?.selling_price || 0));
  const [status, setStatus] = useState(existingBom?.status || "Draft");
  const [productId, setProductId] = useState(existingBom?.product_id || "");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>(
    existingLines?.length
      ? existingLines.map((line, index) => ({
          temp_id: line.id || crypto.randomUUID(),
          line_type: line.line_type || "Ingredient",
          ingredient_id: line.ingredient_id || null,
          line_name: line.line_name || "",
          quantity: Number(line.quantity || 0),
          unit: line.unit || "unit",
          unit_cost: Number(line.unit_cost || 0),
          wastage_percent: Number(line.wastage_percent || 0),
          sort_order: line.sort_order ?? index,
        }))
      : [newLine(0)]
  );

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    if (demo) return;

    async function loadMasterData() {
      try {
        const [ingRes, prodRes] = await Promise.all([fetch("/api/ingredients"), fetch("/api/products")]);
        const ingData = await ingRes.json();
        const prodData = await prodRes.json();
        if (ingData.ok && Array.isArray(ingData.ingredients)) {
          setIngredients(ingData.ingredients);
        }
        if (prodData.ok && Array.isArray(prodData.products)) {
          setProducts(
            prodData.products
              .filter(
                (row: Record<string, unknown>) =>
                  String(row.product_status || row.status || "Active") !== "Archived"
              )
              .map((row: Record<string, unknown>) => ({
                id: String(row.id),
                product_name: String(row.product_name || ""),
              }))
          );
        }
      } catch {
        // keep SSR props
      }
    }

    void loadMasterData();
  }, []);

  useEffect(() => {
    if (demoMode) return;
    const id = existingBom?.id || recipeId;
    if (!id || id.startsWith("demo")) return;

    fetch(`/api/recipes/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !data.recipe) {
          setErrorMessage(data.error || "BOM not found in this workspace.");
          return;
        }
        const header = recipeToBomHeader(data.recipe);
        setBomName(header.bom_name);
        setCategory(header.category || "General");
        setYieldQty(String(header.yield_qty || 1));
        setYieldUnit(header.yield_unit || "unit");
        setTargetGp(String(header.target_gp || 40));
        setSellingPrice(String(header.selling_price || 0));
        setStatus(header.status || "Draft");
        setProductId(header.product_id || "");
        const recipeLines: BomLine[] = (data.recipe.lines || []).map(recipeLineToBomLine);
        if (recipeLines.length) {
          setLines(
            recipeLines.map((line: BomLine, index: number) => ({
              temp_id: line.id || crypto.randomUUID(),
              line_type: line.line_type || "Ingredient",
              ingredient_id: line.ingredient_id || null,
              component_id: line.component_id ?? null,
              line_name: line.line_name || "",
              quantity: Number(line.quantity || 0),
              unit: line.unit || "unit",
              unit_cost: Number(line.unit_cost || 0),
              wastage_percent: Number(line.wastage_percent || 0),
              sort_order: line.sort_order ?? index,
            }))
          );
        }
      })
      .catch(() => {
        // keep SSR props when provided
      });
  }, [demoMode, existingBom?.id, recipeId]);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + calcLineCost(line), 0), [lines]);
  const numericYield = Number(yieldQty || 0);
  const numericSelling = Number(sellingPrice || 0);
  const numericTargetGp = Number(targetGp || 0);
  const costPerUnit = numericYield > 0 ? totalCost / numericYield : totalCost;
  const actualGp = calcGp(numericSelling, costPerUnit);
  const suggestedPrice = calcSuggestedPrice(costPerUnit, numericTargetGp);

  function updateLine(tempId: string, field: keyof DraftLine, value: string | number | null) {
    if (readOnly) return;
    setLines((current) => current.map((line) => (line.temp_id === tempId ? { ...line, [field]: value } : line)));
  }

  function selectIngredientFromLookup(tempId: string, item: ItemLookupResult) {
    if (readOnly) return;
    const ingredientId = item.entityId || item.stockItemId;
    setLines((current) =>
      current.map((line) =>
        line.temp_id === tempId
          ? {
              ...line,
              ingredient_id: ingredientId,
              line_name: item.productName,
              unit: item.unit,
              unit_cost: item.currentCost,
            }
          : line
      )
    );
  }

  function validate() {
    if (!bomName.trim()) return "BOM name is required.";
    if (!numericYield || numericYield <= 0) return "Yield quantity must be more than 0.";
    const bad = lines.find((line) => !line.line_name.trim() || Number(line.quantity || 0) <= 0);
    if (bad) return "Every line must have a name and quantity greater than 0.";
    return "";
  }

  async function saveBom() {
    if (!canSave) {
      setErrorMessage("You do not have permission to save this BOM.");
      return;
    }
    setMessage("");
    setErrorMessage("");
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }

    if (demoMode) {
      setMessage("Demo workspace — BOM changes are not persisted.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        recipe_name: bomName.trim(),
        category,
        yield_qty: numericYield,
        yield_unit: yieldUnit || "unit",
        target_gp: numericTargetGp,
        selling_price: numericSelling,
        status,
        product_id: productId || null,
        lines: lines.map((line, index) => ({
          line_type: line.line_type,
          ingredient_id: line.ingredient_id || null,
          // Without this a save would strip every line's component grouping.
          component_id: line.component_id ?? null,
          line_name: line.line_name.trim(),
          quantity: Number(line.quantity || 0),
          unit: line.unit || "unit",
          unit_cost: Number(line.unit_cost || 0),
          wastage_percent: Number(line.wastage_percent || 0),
          sort_order: index,
        })),
      };

      const response = await fetch(isEdit ? `/api/recipes/${resolvedRecipeId}` : "/api/recipes", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "BOM save failed.");

      const linkedCount = Number(data.linkedProducts || 0);
      setMessage(`BOM saved.${linkedCount ? ` ${linkedCount} product cost(s) updated.` : ""}`);
      if (!isEdit && data.recipe?.id) {
        router.push(`/recipes/${data.recipe.id}`);
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "BOM save failed.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = `mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400 ${readOnly ? "bg-slate-50 text-slate-600" : "bg-white"}`;
  const lineInputClass = `h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-violet-400 ${readOnly ? "bg-slate-50 text-slate-600" : ""}`;
  const labelClass = "text-xs font-black uppercase tracking-[0.08em] text-slate-500";

  const hasMeaningfulLines = lines.some((line) => line.line_name.trim() && Number(line.quantity || 0) > 0);
  const gpGap = numericTargetGp - actualGp;

  return (
    <section className="grid gap-8">
      {readOnly ? (
        <div className="rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-4 text-sm font-bold text-[var(--vyron-warning-fg)]">
          Read-only access — you do not have permission to create or edit recipes / BOMs.
        </div>
      ) : null}

      {/* Premium hero + quote strip */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-indigo-800 to-[#07110d] p-8 text-white shadow-[0_24px_60px_rgba(81,63,190,0.28)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#A855F7]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#CBD5E1]">
              <Sparkles size={14} />
              Premium Costing Workspace
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">BOM Builder</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-violet-100">
              Build a complete bill of materials — ingredients, packaging, labour, overhead and wastage — then watch
              cost per unit, gross profit and suggested price update as you work.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A855F7]">Costing principle</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
                &ldquo;Margin is not luck — it is engineered from yield, wastage and true unit cost.&rdquo;
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Profit discipline</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
                &ldquo;Every line you add reshapes batch cost, GP and the price needed to protect wealth.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Live costing snapshot */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total Batch Cost", formatMoney(totalCost), "text-slate-900", "bg-white"],
          ["Cost / Unit", formatMoney(costPerUnit), "text-violet-700", "bg-violet-50"],
          ["Actual GP", `${actualGp.toFixed(1)}%`, actualGp < numericTargetGp ? "text-red-600" : "text-[#84CC16]", actualGp < numericTargetGp ? "bg-red-50" : "bg-[#A855F7]/10"],
          ["Suggested Batch Price", formatMoney(suggestedPrice), "text-[#7E22CE]", "bg-[#A855F7]/10"],
        ].map(([label, value, cls, bg]) => (
          <div key={label} className={`rounded-[2rem] p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)] ${bg}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`mt-2 text-3xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {gpGap > 0 && numericSelling > 0 ? (
        <div className="rounded-2xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-4 text-sm font-semibold text-[var(--vyron-warning-fg)]">
          GP is <span className="font-black">{gpGap.toFixed(1)}%</span> below your target. Review ingredient costs, yield or selling price before approving this BOM.
        </div>
      ) : null}

      <div className="grid gap-8 2xl:grid-cols-[1fr_380px]">
        <div className="grid gap-8">
          {/* Section 1 — Recipe setup */}
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] md:p-8">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Boxes size={24} />
                </div>
                <div>
                  <div className={labelClass}>Section 1</div>
                  <h3 className="text-2xl font-black text-slate-900">Recipe &amp; Yield Setup</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Name the BOM, set batch yield and classify the recipe for reporting.
                  </p>
                </div>
              </div>
              {canSave ? (
                <button
                  onClick={() => void saveBom()}
                  disabled={saving}
                  className="inline-flex shrink-0 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_30px_rgba(29,107,255,0.35)] disabled:opacity-60"
                >
                  <Save size={18} /> {saving ? "Saving..." : "Save BOM"}
                </button>
              ) : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <label className="block xl:col-span-2">
                <span className={labelClass}>BOM / Recipe Name</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  value={bomName}
                  onChange={(e) => setBomName(e.target.value)}
                  placeholder="BOM / Recipe Name"
                  className={inputClass}
                />
                <FieldHint example="Chicken Pie Batch, All Spice Blend">
                  Use the name your production and finance teams will recognise on reports.
                </FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Category</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category"
                  className={inputClass}
                />
                <FieldHint example="Pies, Sauces, Retail">Groups BOMs for filtering and intelligence.</FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Status</span>
                <select disabled={readOnly} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  <option>Draft</option>
                  <option>Review</option>
                  <option>Approved</option>
                  <option>Archived</option>
                </select>
                <FieldHint example="Draft → Review → Approved">Move to Approved when costing is signed off.</FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Yield Quantity</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  type="number"
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  placeholder="Yield"
                  className={inputClass}
                />
                <FieldHint example="24, 10, 1">Units produced per batch — drives cost per unit.</FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Yield Unit</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  value={yieldUnit}
                  onChange={(e) => setYieldUnit(e.target.value)}
                  placeholder="Yield Unit"
                  className={inputClass}
                />
                <FieldHint example="unit, kg, litre">Matches how you sell or stock the finished item.</FieldHint>
              </label>
            </div>
          </div>

          {/* Section 2 — Pricing */}
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] md:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/12 text-[#7E22CE]">
                <TrendingUp size={24} />
              </div>
              <div>
                <div className={labelClass}>Section 2</div>
                <h3 className="text-2xl font-black text-slate-900">Pricing &amp; GP Targets</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Set selling price and target GP — VYRON calculates actual GP and suggested price from your lines.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <label className="block">
                <span className={labelClass}>Selling Price</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="Selling Price"
                  className={inputClass}
                />
                <FieldHint example="R45.00 per unit">Current or planned shelf / wholesale price.</FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Target GP %</span>
                <input
                  disabled={readOnly}
                  readOnly={readOnly}
                  type="number"
                  value={targetGp}
                  onChange={(e) => setTargetGp(e.target.value)}
                  placeholder="Target GP %"
                  className={inputClass}
                />
                <FieldHint example="40% manufacturing">Used to calculate suggested batch price.</FieldHint>
              </label>

              <label className="block">
                <span className={labelClass}>Link Finished Product</span>
                <select disabled={readOnly} value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
                  <option value="">Link finished product (optional)</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.product_name}
                    </option>
                  ))}
                </select>
                <FieldHint example="Handcrafted Chicken Pie">On save, linked product costs update from this BOM.</FieldHint>
              </label>
            </div>
          </div>

          {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-bold text-[#7E22CE]">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{errorMessage}</div>}

          {/* Section 3 — Cost lines */}
          <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] md:p-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]">
                  <Layers size={24} />
                </div>
                <div>
                  <div className={labelClass}>Section 3</div>
                  <h3 className="text-2xl font-black text-slate-900">Cost Lines</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Add every cost that belongs in this batch — ingredients through to wastage.
                  </p>
                </div>
              </div>
              {canSave ? (
                <div className="flex flex-wrap gap-2">
                  {lineTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setLines((c) => [...c, newLine(c.length, type)])}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                    >
                      <Plus size={14} /> {type}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!ingredients.length ? (
              <div className="mb-5 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 px-5 py-6 text-center">
                <p className="text-sm font-black text-violet-800">No ingredients loaded yet</p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Add ingredients in{" "}
                  <Link href="/ingredients" className="font-black text-violet-700 underline">
                    Ingredients
                  </Link>{" "}
                  first, then return here to build your BOM lines.
                </p>
              </div>
            ) : null}

            {!hasMeaningfulLines ? (
              <div className="mb-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
                <p className="text-sm font-black text-slate-800">Start building your BOM</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Use the buttons above to add <strong>Ingredient</strong>, <strong>Packaging</strong>,{" "}
                  <strong>Labour</strong>, <strong>Overhead</strong> or <strong>Wastage</strong> lines. Pick items from
                  your master list, enter quantities, and line costs will calculate automatically.
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <div className="min-w-[1050px]">
                <div className="grid grid-cols-[125px_290px_90px_90px_110px_90px_120px_55px] bg-[#07110d] px-3 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#A855F7]">
                  <div>Type</div>
                  <div>Line</div>
                  <div>Qty</div>
                  <div>Unit</div>
                  <div>Unit Cost</div>
                  <div>Waste %</div>
                  <div>Line Cost</div>
                  <div></div>
                </div>

                {lines.map((line) => (
                  <div
                    key={line.temp_id}
                    className="grid grid-cols-[125px_290px_90px_90px_110px_90px_120px_55px] items-center border-t border-slate-100 px-3 py-2 text-sm"
                  >
                    <select
                      disabled={readOnly}
                      value={line.line_type}
                      onChange={(e) => updateLine(line.temp_id, "line_type", e.target.value)}
                      className={lineInputClass}
                    >
                      {lineTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>

                    {line.line_type === "Ingredient" || line.line_type === "Packaging" ? (
                      <ItemLookupField
                        className="mx-2"
                        initialValue={line.line_name}
                        defaultType={line.line_type === "Packaging" ? "packaging" : "ingredient"}
                        onSelect={(item) => selectIngredientFromLookup(line.temp_id, item)}
                      />
                    ) : (
                      <input
                        disabled={readOnly}
                        readOnly={readOnly}
                        value={line.line_name}
                        onChange={(e) => updateLine(line.temp_id, "line_name", e.target.value)}
                        className={`mx-2 ${lineInputClass}`}
                      />
                    )}

                    <input
                      disabled={readOnly}
                      readOnly={readOnly}
                      type="number"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.temp_id, "quantity", Number(e.target.value))}
                      className={lineInputClass}
                    />
                    <input
                      disabled={readOnly}
                      readOnly={readOnly}
                      value={line.unit}
                      onChange={(e) => updateLine(line.temp_id, "unit", e.target.value)}
                      className={`mx-2 ${lineInputClass}`}
                    />
                    <input
                      disabled={readOnly}
                      readOnly={readOnly}
                      type="number"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.temp_id, "unit_cost", Number(e.target.value))}
                      className={lineInputClass}
                    />
                    <input
                      disabled={readOnly}
                      readOnly={readOnly}
                      type="number"
                      value={line.wastage_percent}
                      onChange={(e) => updateLine(line.temp_id, "wastage_percent", Number(e.target.value))}
                      className={`mx-2 ${lineInputClass}`}
                    />
                    <div className="text-right text-sm font-black text-slate-900">{formatMoney(calcLineCost(line))}</div>
                    {canSave ? (
                      <button
                        type="button"
                        onClick={() => setLines((c) => c.filter((x) => x.temp_id !== line.temp_id))}
                        className="ml-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar — formula, how-it-works, field guide */}
        <div className="grid gap-6 self-start 2xl:sticky 2xl:top-6">
          <aside className="relative overflow-hidden rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-[#A855F7]/10" />
            <div className="relative">
              <Calculator size={28} className="text-[#A855F7]" />
              <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#A855F7]">Formula Panel</div>
              <h2 className="mt-2 text-2xl font-black">How costs roll up</h2>
              <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold leading-7 text-slate-200">
                <p>
                  <span className="font-black text-white">Line Cost</span> = Qty × Unit Cost × Waste factor
                </p>
                <p>
                  <span className="font-black text-white">Total Cost</span> = sum of all cost lines
                </p>
                <p>
                  <span className="font-black text-white">Cost / Unit</span> = Total Cost ÷ Yield
                </p>
                <p>
                  <span className="font-black text-white">Actual GP</span> = (Selling Price − Cost / Unit) ÷ Selling Price
                </p>
                <p>
                  <span className="font-black text-white">Suggested Price</span> = Cost / Unit ÷ (1 − Target GP%)
                </p>
              </div>
              <div className="mt-5 rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/10 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#CBD5E1]">Live preview</div>
                <div className="mt-2 text-3xl font-black text-white">{actualGp.toFixed(1)}% GP</div>
                <div className="mt-1 text-xs font-semibold text-[#CBD5E1]">Suggested: {formatMoney(suggestedPrice)}</div>
              </div>
            </div>
          </aside>

          <aside className="rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">How it works</div>
            <h2 className="mt-2 text-xl font-black text-slate-900">Guided BOM workflow</h2>
            <ol className="mt-5 space-y-4 text-sm font-semibold leading-6 text-slate-700">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full vyron-grad-surface text-xs font-semibold text-white">1</span>
                <span>Name the BOM and set yield — this defines cost per finished unit.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full vyron-grad-surface text-xs font-semibold text-white">2</span>
                <span>Add cost lines from ingredients, packaging, labour, overhead and wastage.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full vyron-grad-surface text-xs font-semibold text-white">3</span>
                <span>Set selling price and target GP — compare actual GP to your goal.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full vyron-grad-surface text-xs font-semibold text-white">4</span>
                <span>Save — linked products inherit updated costs automatically.</span>
              </li>
            </ol>
            <Link
              href="/recipes"
              className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Back to Recipes <ArrowRight size={16} />
            </Link>
          </aside>

          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-800 via-indigo-900 to-slate-950 p-6 text-white shadow-[0_18px_55px_rgba(81,63,190,0.2)]">
            <div className="pointer-events-none absolute -right-8 top-8 h-32 w-32 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute bottom-6 left-6 h-20 w-20 rounded-full border border-[#A855F7]/25" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-200">Wealth protection</div>
              <p className="mt-3 text-lg font-black leading-snug">
                A BOM is your financial blueprint — not just a recipe card.
              </p>
              <p className="mt-3 text-sm font-semibold leading-6 text-violet-100">
                Operators who cost every line protect margin before price pressure hits the P&amp;L.
              </p>
            </div>
          </div>

          <VyronFieldGuide
            title="BOM Field Guide"
            subtitle="What each header field controls in your costing model."
            items={bomFieldGuide}
            footer={
              <p className="text-sm font-semibold leading-6 text-violet-900">
                Tip: link a finished product so saves push batch cost through to Product Master GP.
              </p>
            }
          />
        </div>
      </div>
    </section>
  );
}
