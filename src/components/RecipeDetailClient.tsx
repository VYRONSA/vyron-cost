"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import {
  BomHeader,
  BomLine,
  calcGp,
  calcLineCost,
  calcSuggestedPrice,
  demoBomLines,
  demoBoms,
  formatMoney,
  formatPreciseMoney,
  formatQuantity,
} from "@/lib/vyron-cost-bom-data";
import type { RecipeComponentRecord } from "@/lib/vyron-cost-recipes-data";
import { normaliseBomPurpose } from "@/lib/vyron-cost-sub-boms";
import { recipeLineToBomLine, recipeToBomHeader } from "@/lib/vyron-cost-recipes-data";
import { readActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { ItemLookupField } from "@/components/vyron-platform/item-lookup/ItemLookupField";

type ProductLink = { id: string; product_name: string };

type LineDraft = {
  line_type: string;
  ingredient_id: string | null;
  line_name: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  wastage_percent: string;
};

const EMPTY_LINE: LineDraft = {
  line_type: "Ingredient",
  ingredient_id: null,
  line_name: "",
  quantity: "",
  unit: "kg",
  unit_cost: "",
  wastage_percent: "0",
};

const COMPONENT_TYPES = ["Product Component", "Condiment", "Packaging", "Other"];

const controlClass =
  "w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400";

export default function RecipeDetailClient({
  recipeId,
  initialBom,
  initialLines,
}: {
  recipeId: string;
  initialBom?: BomHeader | null;
  initialLines?: BomLine[];
}) {
  const { canCreate, canEdit, canDelete } = useModulePermissions("boms");
  const [demoMode, setDemoMode] = useState(false);
  const [bom, setBom] = useState<BomHeader | null>(initialBom ?? null);
  const [lines, setLines] = useState<BomLine[]>(initialLines ?? []);
  const [linkedProduct, setLinkedProduct] = useState<ProductLink | null>(null);
  const [components, setComponents] = useState<RecipeComponentRecord[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [addingComponent, setAddingComponent] = useState(false);
  const [componentDraft, setComponentDraft] = useState({ name: "", component_type: "Product Component", sort_order: "", notes: "" });
  const [lineDraftFor, setLineDraftFor] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<LineDraft>({ ...EMPTY_LINE });

  useEffect(() => {
    const client = readActiveClient();
    const demo = isDemoWorkspace(client);
    setDemoMode(demo);

    if (demo) {
      const match = demoBoms.find((item) => item.id === recipeId) || null;
      setBom(match);
      setLines(match ? demoBomLines.filter((line) => line.bom_id === match.id) : []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.ok || !data.recipe) {
          setBom(null);
          setLines([]);
          setError(data.error || "BOM not found.");
          return;
        }
        const header = recipeToBomHeader(data.recipe);
        setBom(header);
        setLines((data.recipe.lines || []).map(recipeLineToBomLine));
        setComponents(data.recipe.components || []);

        if (data.recipe.image_path) {
          const img = await fetch(`/api/recipes/${recipeId}/image`).then((r) => r.json()).catch(() => null);
          setImageUrl(img?.ok && img.image?.url ? img.image.url : null);
        } else {
          setImageUrl(null);
        }

        if (header.product_id) {
          const prodRes = await fetch("/api/products").then((r) => r.json());
          if (prodRes.ok && Array.isArray(prodRes.products)) {
            const match = prodRes.products.find((p: { id: string }) => p.id === header.product_id);
            if (match) {
              setLinkedProduct({ id: String(match.id), product_name: String(match.product_name || "") });
            }
          }
        } else {
          setLinkedProduct(null);
        }
      })
      .catch(() => {
        setBom(null);
        setLines([]);
        setError("Could not load BOM.");
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  const totals = useMemo(() => {
    if (!bom) return null;
    const calculatedTotalCost = lines.reduce(
      (sum, line) => sum + Number(line.line_cost ?? calcLineCost(line)),
      0
    );
    const totalCost = calculatedTotalCost > 0 ? calculatedTotalCost : Number(bom.total_cost || 0);
    const yieldQty = Math.max(1, Number(bom.yield_qty || 1));
    const costPerUnit =
      Number(bom.cost_per_unit || 0) > 0
        ? Number(bom.cost_per_unit)
        : yieldQty > 0
          ? totalCost / yieldQty
          : totalCost;
    const sellingPrice = Number(bom.selling_price || 0);
    const targetGp = Number(bom.target_gp || 0);
    return {
      totalCost,
      costPerUnit,
      sellingPrice,
      actualGp: Number(bom.calculated_gp ?? calcGp(sellingPrice, costPerUnit)),
      suggestedBatchPrice: Number(
        bom.suggested_selling_price ?? calcSuggestedPrice(costPerUnit, targetGp)
      ),
      targetGp,
    };
  }, [bom, lines]);

  /**
   * Lines are grouped by their component, in component order. Subtotals are a
   * plain sum of the same stored line costs the costing engine uses — this is
   * presentation, not a second calculation. Any line without a component (or a
   * demo BOM, which has none) still shows, under an Ungrouped heading, so a
   * line can never disappear from the screen just because it lacks a grouping.
   */
  const groups = useMemo(() => {
    const byId = new Map(components.map((c) => [c.id, c]));
    const buckets = new Map<string, BomLine[]>();
    for (const line of lines) {
      const key = line.component_id && byId.has(line.component_id) ? line.component_id : "__ungrouped__";
      const list = buckets.get(key);
      if (list) list.push(line);
      else buckets.set(key, [line]);
    }
    const out = components
      .map((c) => ({
        key: c.id,
        name: c.name,
        type: c.component_type,
        component: c as RecipeComponentRecord | null,
        isPackaging: c.component_type.trim().toLowerCase() === "packaging",
        lines: buckets.get(c.id) ?? [],
        subtotal: (buckets.get(c.id) ?? []).reduce(
          (sum, l) => sum + Number(l.line_cost ?? calcLineCost(l)),
          0
        ),
      }));
    const rest = buckets.get("__ungrouped__");
    if (rest?.length) {
      out.push({
        key: "__ungrouped__",
        name: components.length ? "Ungrouped lines" : "BOM Lines",
        type: "",
        component: null,
        isPackaging: false,
        lines: rest,
        subtotal: rest.reduce((sum, l) => sum + Number(l.line_cost ?? calcLineCost(l)), 0),
      });
    }
    return out;
  }, [components, lines]);

  /**
   * Prefer the stored split; fall back to summing the lines so a demo BOM, or
   * one saved before the split existed, still shows a correct breakdown.
   */
  const packagingCost = useMemo(
    () =>
      bom?.packaging_cost != null
        ? Number(bom.packaging_cost)
        : lines
            .filter((l) => l.line_type.trim().toLowerCase() === "packaging")
            .reduce((s, l) => s + Number(l.line_cost ?? calcLineCost(l)), 0),
    [bom, lines]
  );
  const bomPurpose = normaliseBomPurpose(bom?.bom_purpose);
  const ingredientCost = useMemo(
    () =>
      bom?.ingredient_cost != null
        ? Number(bom.ingredient_cost)
        : lines
            .filter((l) => l.line_type.trim().toLowerCase() !== "packaging")
            .reduce((s, l) => s + Number(l.line_cost ?? calcLineCost(l)), 0),
    [bom, lines]
  );

  /**
   * Every mutation re-reads the recipe from the server rather than patching
   * local state, so what the screen shows after an edit is what the database
   * actually holds — including the costs the engine recomputed.
   */
  async function refresh() {
    const res = await fetch(`/api/recipes/${recipeId}`);
    const data = await res.json();
    if (!data.ok || !data.recipe) throw new Error(data.error || "Reload failed.");
    setBom(recipeToBomHeader(data.recipe));
    setLines((data.recipe.lines || []).map(recipeLineToBomLine));
    setComponents(data.recipe.components || []);
  }

  async function run(action: () => Promise<Response>, success: string) {
    if (demoMode) {
      setNotice("Demo workspace — changes are not saved.");
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const res = await action();
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "Request failed.");
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addComponent() {
    const name = componentDraft.name.trim();
    if (!name) {
      setError("Component name is required.");
      return;
    }
    await run(
      () =>
        fetch(`/api/recipes/${recipeId}/components`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            component_type: componentDraft.component_type,
            sort_order: componentDraft.sort_order.trim() ? Number(componentDraft.sort_order) : undefined,
            notes: componentDraft.notes.trim() || null,
          }),
        }),
      `Component “${name}” added.`
    );
    setComponentDraft({ name: "", component_type: "Product Component", sort_order: "", notes: "" });
    setAddingComponent(false);
  }

  async function addLine(componentId: string) {
    const name = lineDraft.line_name.trim();
    if (!name) {
      setError("Choose an ingredient first.");
      return;
    }
    await run(
      () =>
        fetch(`/api/recipes/${recipeId}/lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            component_id: componentId,
            line_type: lineDraft.line_type,
            ingredient_id: lineDraft.ingredient_id,
            line_name: name,
            quantity: Number(lineDraft.quantity || 0),
            unit: lineDraft.unit || "kg",
            unit_cost: Number(lineDraft.unit_cost || 0),
            wastage_percent: Number(lineDraft.wastage_percent || 0),
          }),
        }),
      `“${name}” added.`
    );
    setLineDraft({ ...EMPTY_LINE });
    setLineDraftFor(null);
  }

  /**
   * Deleting a component only removes the grouping — the schema sets its lines'
   * component_id to null rather than deleting them. A component that still has
   * lines therefore asks first, so no one loses track of costing by accident.
   */
  async function removeComponent(component: RecipeComponentRecord) {
    const count = lines.filter((l) => l.component_id === component.id).length;
    if (count) {
      const ok = window.confirm(
        `“${component.name}” still has ${count} line${count === 1 ? "" : "s"}.\n\n` +
          `Deleting the component keeps those lines and their costs on this BOM — they simply become ungrouped. Continue?`
      );
      if (!ok) return;
    }
    await run(
      () => fetch(`/api/recipes/${recipeId}/components/${component.id}`, { method: "DELETE" }),
      `Component “${component.name}” removed.`
    );
  }

  /** Moving a line changes only its component_id — never its costing values. */
  async function moveLine(lineId: string, componentId: string) {
    await run(
      () =>
        fetch(`/api/recipes/${recipeId}/lines/${lineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ component_id: componentId || null }),
        }),
      "Line moved."
    );
  }

  if (loading) {
    return <p className="text-sm font-bold text-slate-500">Loading BOM…</p>;
  }

  if (!bom || error) {
    return (
      <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600">
        {error || "BOM not found."}
        <div className="mt-4">
          <Link href="/recipes" className="text-sm font-black text-violet-700">
            ← Back to Recipes
          </Link>
        </div>
      </div>
    );
  }

  if (!totals) return null;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Recipe Detail",
        subtitle: "Premium VYRON COST workflow for recipe detail.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/recipes" className="text-xs font-black text-violet-700">
                ← Recipes & BOM
              </Link>
              {canEdit ? (
                <Link href={`/recipes/${bom.id}/edit`} className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
                  Edit BOM
                </Link>
              ) : null}
            </div>
      
            {linkedProduct ? (
              <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-bold text-[#4D7C0F]">
                Linked finished product:{" "}
                <Link href={`/products/${linkedProduct.id}/edit`} className="font-black text-[#7E22CE] underline">
                  {linkedProduct.product_name}
                </Link>
                {" · "}Product cost syncs when this BOM is saved.
              </div>
            ) : null}
      
            {imageUrl ? (
              <div className="overflow-hidden rounded-[2rem] bg-white p-4 shadow-[0_18px_50px_rgba(81,63,190,0.08)] sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={`${bom.bom_name} pack`}
                    className="h-52 w-full rounded-2xl border border-violet-100 object-cover sm:h-40 sm:w-64"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Product / pack photo</div>
                    <h2 className="mt-1 truncate text-2xl font-black text-slate-900">{bom.bom_name}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">{bom.category || "Uncategorised"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {/*
              What this BOM is for, in the reader's language. A Finished Good
              names the product production receives into stock; a Sub-BOM says
              plainly that it is used inside another BOM and is not sold on its
              own. No database terms appear here.
            */}
            <div
              className={`rounded-[2rem] border p-5 shadow-sm ${
                bomPurpose === "Sub-BOM" ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                {bomPurpose === "Sub-BOM" ? "BOM Purpose" : "Finished Product"}
              </div>
              {bomPurpose === "Sub-BOM" ? (
                <>
                  <p className="mt-1 text-lg font-black text-sky-900">Sub-BOM / Assembly</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Used as a component inside another BOM. It is not sold on its own and holds no finished-goods stock.
                  </p>
                </>
              ) : linkedProduct ? (
                <>
                  <p className="mt-1 text-lg font-black text-emerald-900">{linkedProduct.product_name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Production of this BOM receives stock against this product.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-black text-emerald-900">Not linked yet</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    This BOM produces a finished product, but none is linked. Production cannot receive stock until one is.
                  </p>
                </>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-5">
              {[
                ["Ingredient Cost", formatMoney(ingredientCost), "text-slate-900"],
                ["Packaging Cost", formatMoney(packagingCost), "text-violet-700"],
                ["Total Cost", formatMoney(totals.totalCost), "text-slate-900"],
                ["Selling Price", formatMoney(totals.sellingPrice), "text-slate-900"],
                ["GP", `${totals.actualGp.toFixed(2)}%`, totals.actualGp < totals.targetGp ? "text-red-600" : "text-[#84CC16]"],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-[2rem] bg-white p-4 shadow-[0_18px_50px_rgba(81,63,190,0.08)] md:p-6">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
                  <div className={`mt-2 text-2xl font-black md:mt-3 md:text-3xl ${cls}`}>{value}</div>
                </div>
              ))}
            </div>
      
            <section className="rounded-[2rem] border border-violet-100 bg-violet-50 p-5 text-sm font-black text-violet-900">
              Formula used: Actual GP = (Selling Price - Cost / Unit) / Selling Price. Suggested Price = Cost / Unit / (1 - Target GP%).
            </section>
      
            <section className="rounded-[2rem] bg-white p-4 shadow-[0_18px_50px_rgba(81,63,190,0.08)] sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black text-slate-900">Recipe Components</h2>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => setAddingComponent((v) => !v)}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-700 disabled:opacity-60"
                  >
                    <Plus size={16} />
                    Add Component
                  </button>
                ) : null}
              </div>

              {notice ? (
                <p className="mb-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{notice}</p>
              ) : null}
              {error ? (
                <p className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
              ) : null}

              {addingComponent && canCreate ? (
                <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Component name
                      <input
                        autoFocus
                        value={componentDraft.name}
                        onChange={(e) => setComponentDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Salmon maki"
                        className={`mt-2 ${controlClass}`}
                      />
                    </label>
                    <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Component type
                      <select
                        value={componentDraft.component_type}
                        onChange={(e) => setComponentDraft((d) => ({ ...d, component_type: e.target.value }))}
                        className={`mt-2 ${controlClass}`}
                      >
                        {COMPONENT_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Sort order (optional)
                      <input
                        value={componentDraft.sort_order}
                        onChange={(e) => setComponentDraft((d) => ({ ...d, sort_order: e.target.value }))}
                        inputMode="numeric"
                        placeholder="auto"
                        className={`mt-2 ${controlClass}`}
                      />
                    </label>
                    <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Notes (optional)
                      <input
                        value={componentDraft.notes}
                        onChange={(e) => setComponentDraft((d) => ({ ...d, notes: e.target.value }))}
                        className={`mt-2 ${controlClass}`}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void addComponent()}
                      disabled={busy}
                      className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Create component"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingComponent(false)}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    This component belongs to this BOM only. Another recipe may use the same name with different ingredients.
                  </p>
                </div>
              ) : null}

              {lines.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">No cost lines on this BOM yet.</p>
              ) : (
                <div className="grid gap-3">
                  {groups.map((group) => {
                    const open = expanded[group.key] ?? true;
                    return (
                      <div key={group.key} className="overflow-hidden rounded-2xl border border-violet-100">
                        <button
                          type="button"
                          onClick={() => setExpanded((s) => ({ ...s, [group.key]: !open }))}
                          aria-expanded={open}
                          className="flex w-full items-center gap-3 bg-violet-50 px-4 py-4 text-left sm:px-5"
                        >
                          {open ? (
                            <ChevronDown size={18} className="shrink-0 text-violet-700" />
                          ) : (
                            <ChevronRight size={18} className="shrink-0 text-violet-700" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-slate-900 sm:text-base">{group.name}</span>
                            <span className="block text-xs font-bold text-slate-500">
                              {group.lines.length} {group.isPackaging ? (group.lines.length === 1 ? "item" : "items") : group.lines.length === 1 ? "ingredient" : "ingredients"}
                              {group.type ? ` · ${group.type}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-black text-violet-700 sm:text-base">{formatMoney(group.subtotal)}</span>
                          {canDelete && group.component ? (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Delete component ${group.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeComponent(group.component as RecipeComponentRecord);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void removeComponent(group.component as RecipeComponentRecord);
                                }
                              }}
                              className="shrink-0 rounded-xl bg-white/70 p-2 text-red-600"
                            >
                              <Trash2 size={15} />
                            </span>
                          ) : null}
                        </button>

                        {open ? (
                          <>
                            <div className="overflow-x-auto">
                              <div className="min-w-[620px]">
                              <div className="grid grid-cols-[minmax(0,2fr)_1fr_0.7fr_1fr_1fr] bg-slate-50 px-4 py-3 text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500 sm:px-5">
                                <div>Ingredient</div>
                                <div className="pr-3 text-right">Qty</div>
                                <div className="pl-1">Unit</div>
                                <div className="text-right">Unit Cost</div>
                                <div className="text-right">Line Cost</div>
                              </div>
                              {group.lines.map((line) => (
                                <div
                                  key={line.id}
                                  className="grid grid-cols-[minmax(0,2fr)_1fr_0.7fr_1fr_1fr] items-center border-t border-slate-100 px-4 py-3 text-sm sm:px-5"
                                >
                                  <div className="truncate font-black text-slate-900">{line.line_name}</div>
                                  <div className="pr-3 text-right font-bold tabular-nums text-slate-600">{formatQuantity(line.quantity)}</div>
                                  <div className="pl-1 font-bold text-slate-500">{line.unit}</div>
                                  <div className="text-right font-bold tabular-nums text-violet-700">{formatPreciseMoney(line.unit_cost)}</div>
                                  <div className="text-right font-black tabular-nums text-slate-900">
                                    {formatPreciseMoney(line.line_cost ?? calcLineCost(line))}
                                    {canEdit && components.length > 1 ? (
                                      <select
                                        aria-label={`Move ${line.line_name} to another component`}
                                        value={line.component_id || ""}
                                        onChange={(e) => void moveLine(line.id, e.target.value)}
                                        disabled={busy}
                                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[0.7rem] font-bold text-slate-600 outline-none"
                                      >
                                        {components.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                        <option value="">Ungrouped</option>
                                      </select>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                              <div className="grid grid-cols-[minmax(0,2fr)_1fr_0.7fr_1fr_1fr] border-t border-violet-100 bg-violet-50/60 px-4 py-3 text-sm sm:px-5">
                                <div className="col-span-4 font-black text-slate-700">Component Cost</div>
                                <div className="text-right font-black tabular-nums text-slate-900">{formatPreciseMoney(group.subtotal)}</div>
                              </div>
                              </div>
                            </div>

                            {canEdit && group.component ? (
                                <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                                  {lineDraftFor === group.key ? (
                                    <div className="grid gap-3">
                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Ingredient / packaging
                                          <div className="mt-2">
                                            <ItemLookupField
                                              initialValue={lineDraft.line_name}
                                              defaultType={lineDraft.line_type === "Packaging" ? "packaging" : "ingredient"}
                                              onSelect={(item) =>
                                                setLineDraft((d) => ({
                                                  ...d,
                                                  ingredient_id: item.entityId || item.stockItemId,
                                                  line_name: item.productName,
                                                  unit: item.unit || d.unit,
                                                  unit_cost: String(item.currentCost ?? d.unit_cost ?? ""),
                                                }))
                                              }
                                            />
                                          </div>
                                        </div>
                                        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Line type
                                          <select
                                            value={lineDraft.line_type}
                                            onChange={(e) => setLineDraft((d) => ({ ...d, line_type: e.target.value }))}
                                            className={`mt-2 ${controlClass}`}
                                          >
                                            <option>Ingredient</option>
                                            <option>Packaging</option>
                                          </select>
                                        </label>
                                        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Quantity
                                          <input
                                            value={lineDraft.quantity}
                                            onChange={(e) => setLineDraft((d) => ({ ...d, quantity: e.target.value }))}
                                            inputMode="decimal"
                                            placeholder="0.006250"
                                            className={`mt-2 ${controlClass}`}
                                          />
                                        </label>
                                        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Unit
                                          <input
                                            value={lineDraft.unit}
                                            onChange={(e) => setLineDraft((d) => ({ ...d, unit: e.target.value }))}
                                            className={`mt-2 ${controlClass}`}
                                          />
                                        </label>
                                        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Unit cost
                                          <input
                                            value={lineDraft.unit_cost}
                                            onChange={(e) => setLineDraft((d) => ({ ...d, unit_cost: e.target.value }))}
                                            inputMode="decimal"
                                            placeholder="147.42567"
                                            className={`mt-2 ${controlClass}`}
                                          />
                                        </label>
                                        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                          Wastage %
                                          <input
                                            value={lineDraft.wastage_percent}
                                            onChange={(e) => setLineDraft((d) => ({ ...d, wastage_percent: e.target.value }))}
                                            inputMode="decimal"
                                            className={`mt-2 ${controlClass}`}
                                          />
                                        </label>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void addLine(group.key)}
                                          disabled={busy}
                                          className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                                        >
                                          {busy ? "Saving…" : "Add to component"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setLineDraftFor(null);
                                            setLineDraft({ ...EMPTY_LINE });
                                          }}
                                          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLineDraft({ ...EMPTY_LINE, line_type: group.isPackaging ? "Packaging" : "Ingredient" });
                                        setLineDraftFor(group.key);
                                      }}
                                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-700"
                                    >
                                      <Plus size={16} />
                                      Add Ingredient
                                    </button>
                                  )}
                                </div>
                              ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
      
            {demoMode ? (
              <p className="text-xs font-bold text-[var(--vyron-warning-fg)]">Demo workspace — sample BOM data only.</p>
            ) : null}
          </section>
    </VyronPremiumPageShell>
  );
}
