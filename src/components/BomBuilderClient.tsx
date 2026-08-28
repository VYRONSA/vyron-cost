"use client";

import { ArrowRight, Boxes, Calculator, ChevronDown, ChevronUp, Copy, Layers, Plus, Save, Sparkles, Trash2, TrendingUp } from "lucide-react";
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
import {
  BOM_PURPOSES,
  BOM_PURPOSE_DESCRIPTIONS,
  BOM_PURPOSE_LABELS,
  normaliseBomPurpose,
  SUB_BOM_LINE_TYPE,
  type BomPurpose,
} from "@/lib/vyron-cost-sub-boms";
import { buildCopyDraft, toDraftLine } from "@/lib/vyron-cost-bom-draft";
import { RecipeImageField } from "@/components/RecipeImageField";
import type { ItemLookupResult } from "@/lib/platform/item-lookup/ItemLookupTypes";

type DraftLine = Omit<BomLine, "id" | "bom_id" | "line_cost"> & {
  temp_id: string;
  /** Set when the line stands for another BOM rather than an ingredient. */
  child_bom_id?: string | null;
  child_bom_name?: string | null;
};
type BomOption = { id: string; recipe_name: string; bom_purpose?: string | null; cost_per_unit: number };
type ProductOption = {
  id: string;
  product_name: string;
  /** The BOM that already produces this product, if any. */
  linked_bom_id: string | null;
};

/**
 * A component is the unit a person actually builds a pack from — "Salmon maki",
 * "Condiments", "Packaging" — so the editor holds its lines inside it rather
 * than asking which component every single row belongs to.
 *
 * `id` is present once the component exists in the database; a component added
 * here is saved on the way out and only then gets one.
 */
type DraftComponent = {
  temp_id: string;
  id: string | null;
  name: string;
  component_type: string;
  lines: DraftLine[];
};

const componentTypes = ["Product Component", "Condiment", "Packaging", "Other"];

/** Components are ordered 10, 20, 30 … so a later insert has room between them. */
const componentSortOrder = (index: number) => (index + 1) * 10;

function newComponent(name = "", type = "Product Component"): DraftComponent {
  return { temp_id: crypto.randomUUID(), id: null, name, component_type: type, lines: [] };
}

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
  copyFromId,
  copyImage = false,
  copyName,
}: {
  ingredients: CostIngredient[];
  existingBom?: BomHeader | null;
  existingLines?: BomLine[];
  recipeId?: string;
  /** Source BOM for a Copy & Edit draft. Read only, and never written to. */
  copyFromId?: string;
  copyImage?: boolean;
  /** The name the operator typed before opening the draft, if any. */
  copyName?: string;
}) {
  const router = useRouter();
  const { canCreate, canEdit } = useModulePermissions("boms");
  const resolvedRecipeId = existingBom?.id || recipeId || "";
  const isEdit = Boolean(resolvedRecipeId && !resolvedRecipeId.startsWith("demo"));
  /*
   * A Copy & Edit draft. Nothing exists in the database yet: the source is read
   * once to fill the form, and Save takes the ordinary create path, so
   * abandoning the page leaves nothing behind. isEdit stays false throughout,
   * which is what keeps Save from writing to the BOM being copied.
   */
  const isCopy = Boolean(copyFromId) && !isEdit;
  const canSave = isEdit ? canEdit : canCreate;
  const readOnly = !canSave;
  const [demoMode, setDemoMode] = useState(false);
  const [, setIngredients] = useState(initialIngredients);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [bomName, setBomName] = useState(existingBom?.bom_name || "");
  const [category, setCategory] = useState(existingBom?.category || "General");
  const [yieldQty, setYieldQty] = useState(String(existingBom?.yield_qty || 1));
  const [yieldUnit, setYieldUnit] = useState(existingBom?.yield_unit || "unit");
  const [targetGp, setTargetGp] = useState(String(existingBom?.target_gp || 40));
  const [sellingPrice, setSellingPrice] = useState(String(existingBom?.selling_price || 0));
  const [status, setStatus] = useState(existingBom?.status || "Draft");
  const [productId, setProductId] = useState(existingBom?.product_id || "");
  const [bomPurpose, setBomPurpose] = useState<BomPurpose>(normaliseBomPurpose(existingBom?.bom_purpose));
  /** Which component is waiting for a BOM to be picked, and the picker's state. */
  const [bomPickerFor, setBomPickerFor] = useState<string | null>(null);
  const [bomOptions, setBomOptions] = useState<BomOption[]>([]);
  const [bomSearch, setBomSearch] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [components, setComponents] = useState<DraftComponent[]>([]);
  /**
   * Lines that predate components, or whose component was removed. Never
   * invented — and seeded from the server-rendered lines so an edit shows its
   * content immediately, before the grouped fetch lands.
   */
  const [ungrouped, setUngrouped] = useState<DraftLine[]>(
    (existingLines || []).map(
      (line, index) => ({ ...toDraftLine(line, index, () => line.id || crypto.randomUUID()) }) as DraftLine
    )
  );
  const [removedComponentIds, setRemovedComponentIds] = useState<string[]>([]);
  const [movingLine, setMovingLine] = useState<string | null>(null);

  // Every cost figure still comes from one flat list of lines, exactly as before.
  const lines = useMemo<DraftLine[]>(
    () => [...components.flatMap((c) => c.lines), ...ungrouped],
    [components, ungrouped]
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
                linked_bom_id: row.linked_bom_id ? String(row.linked_bom_id) : null,
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
        setBomPurpose(normaliseBomPurpose(header.bom_purpose));
        const recipeLines: BomLine[] = (data.recipe.lines || []).map(recipeLineToBomLine);
        // Same mapping as a copy uses, so a line cannot keep its identity in one
        // path and lose it in the other. Existing lines keep their own id as the
        // draft key; only a copy needs fresh ones.
        const toDraft = (line: BomLine, index: number): DraftLine =>
          ({ ...toDraftLine(line, index, () => line.id || crypto.randomUUID()) }) as DraftLine;
        const drafts = recipeLines.map(toDraft);
        const loaded: DraftComponent[] = (data.recipe.components || []).map(
          (c: { id: string; name: string; component_type: string }) => ({
            temp_id: c.id,
            id: c.id,
            name: c.name,
            component_type: c.component_type || "Product Component",
            lines: drafts.filter((l) => l.component_id === c.id),
          })
        );
        setComponents(loaded);
        const known = new Set(loaded.map((c) => c.id));
        setUngrouped(drafts.filter((l) => !l.component_id || !known.has(l.component_id)));
      })
      .catch(() => {
        // keep SSR props when provided
      });
  }, [demoMode, existingBom?.id, recipeId]);

  /*
   * Fill the form from the BOM being copied.
   *
   * Every component is given a brand new temporary identity with id === null,
   * so the save path creates components instead of PATCHing the source's. That
   * one detail is what keeps the original untouched: reusing a source component
   * id here would rename the original's components on save.
   *
   * Ingredient and child-BOM references are carried across as they are. Both are
   * shared master records — two BOMs may legitimately use the same ingredient
   * and the same sub-assembly, and duplicating either would create a second copy
   * nobody asked for that then drifts from the first.
   */
  useEffect(() => {
    if (demoMode || !isCopy || !copyFromId) return;
    let cancelled = false;

    fetch(`/api/recipes/${copyFromId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok || !data.recipe) {
          setErrorMessage(data.error || "That BOM could not be found in this workspace.");
          return;
        }
        const header = recipeToBomHeader(data.recipe);
        // One mapping decides everything about the draft, so what the tests
        // exercise and what the editor shows cannot drift apart.
        const draft = buildCopyDraft(
          { ...data.recipe, bom_name: header.bom_name },
          (data.recipe.lines || []).map(recipeLineToBomLine),
          () => crypto.randomUUID()
        );

        setBomName(copyName?.trim() || draft.bom_name);
        setCategory(draft.category);
        setYieldQty(draft.yield_qty);
        setYieldUnit(draft.yield_unit);
        setTargetGp(draft.target_gp);
        setSellingPrice(draft.selling_price);
        setStatus(draft.status);
        setProductId(draft.product_id);
        setBomPurpose(draft.bom_purpose);

        setComponents(draft.components as DraftComponent[]);
        setUngrouped(draft.ungrouped as DraftLine[]);
        setRemovedComponentIds([]);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage("That BOM could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [demoMode, isCopy, copyFromId, copyName]);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + calcLineCost(line), 0), [lines]);
  const numericYield = Number(yieldQty || 0);
  const numericSelling = Number(sellingPrice || 0);
  const numericTargetGp = Number(targetGp || 0);
  const costPerUnit = numericYield > 0 ? totalCost / numericYield : totalCost;
  const actualGp = calcGp(numericSelling, costPerUnit);
  const suggestedPrice = calcSuggestedPrice(costPerUnit, numericTargetGp);

  /** Apply a change to one line wherever it lives — inside a component or not. */
  function patchLine(tempId: string, patch: Partial<DraftLine>) {
    if (readOnly) return;
    const apply = (l: DraftLine) => (l.temp_id === tempId ? { ...l, ...patch } : l);
    setComponents((cs) => cs.map((c) => ({ ...c, lines: c.lines.map(apply) })));
    setUngrouped((ls) => ls.map(apply));
  }

  function updateLine(tempId: string, field: keyof DraftLine, value: string | number | null) {
    patchLine(tempId, { [field]: value } as Partial<DraftLine>);
  }

  function selectIngredientFromLookup(tempId: string, item: ItemLookupResult) {
    patchLine(tempId, {
      ingredient_id: item.entityId || item.stockItemId,
      line_name: item.productName,
      unit: item.unit,
      unit_cost: item.currentCost,
    });
  }

  function removeLine(tempId: string) {
    if (readOnly) return;
    const drop = (ls: DraftLine[]) => ls.filter((l) => l.temp_id !== tempId);
    setComponents((cs) => cs.map((c) => ({ ...c, lines: drop(c.lines) })));
    setUngrouped(drop);
  }

  /** A line added here belongs to this component — no second choice to make. */
  function addLineTo(componentTempId: string, type: "Ingredient" | "Packaging") {
    if (readOnly) return;
    const line = newLine(0, type);
    setComponents((cs) =>
      cs.map((c) => (c.temp_id === componentTempId ? { ...c, lines: [...c.lines, line] } : c))
    );
  }

  /**
   * Adding a BOM to a component. The picker lists this workspace's other BOMs;
   * the BOM being edited is never offered, and the server refuses anything that
   * would close a loop even if it were.
   */
  async function openBomPicker(componentTempId: string) {
    if (readOnly) return;
    setBomPickerFor(componentTempId);
    setBomSearch("");
    try {
      const res = await fetch("/api/recipes?limit=500");
      const data = await res.json();
      const rows: BomOption[] = (data?.recipes || [])
        .map((r: Record<string, unknown>) => ({
          id: String(r.id),
          recipe_name: String(r.recipe_name || r.bom_name || ""),
          bom_purpose: r.bom_purpose ? String(r.bom_purpose) : null,
          cost_per_unit: Number(r.cost_per_unit || 0),
        }))
        .filter((r: BomOption) => r.id !== recipeId);
      setBomOptions(rows);
    } catch {
      setBomOptions([]);
    }
  }

  function addBomLineTo(componentTempId: string, option: BomOption) {
    const line: DraftLine = {
      ...newLine(0, SUB_BOM_LINE_TYPE),
      line_name: option.recipe_name,
      unit: "unit",
      quantity: 1,
      unit_cost: option.cost_per_unit,
      child_bom_id: option.id,
      child_bom_name: option.recipe_name,
    };
    setComponents((cs) =>
      cs.map((c) => (c.temp_id === componentTempId ? { ...c, lines: [...c.lines, line] } : c))
    );
    setBomPickerFor(null);
  }

  function moveLineToComponent(tempId: string, targetTempId: string) {
    if (readOnly) return;
    let moved: DraftLine | undefined;
    const take = (ls: DraftLine[]) => ls.filter((l) => (l.temp_id === tempId ? ((moved = l), false) : true));
    const nextComponents = components.map((c) => ({ ...c, lines: take(c.lines) }));
    const nextUngrouped = take(ungrouped);
    if (!moved) return;
    setComponents(
      nextComponents.map((c) =>
        c.temp_id === targetTempId ? { ...c, lines: [...c.lines, moved as DraftLine] } : c
      )
    );
    setUngrouped(targetTempId === "__ungrouped__" ? [...nextUngrouped, moved] : nextUngrouped);
    setMovingLine(null);
  }

  function addComponent() {
    if (readOnly) return;
    setComponents((cs) => [...cs, newComponent("", cs.length ? "Product Component" : "Product Component")]);
  }

  function patchComponent(tempId: string, patch: Partial<DraftComponent>) {
    if (readOnly) return;
    setComponents((cs) => cs.map((c) => (c.temp_id === tempId ? { ...c, ...patch } : c)));
  }

  function moveComponent(tempId: string, delta: -1 | 1) {
    if (readOnly) return;
    setComponents((cs) => {
      const i = cs.findIndex((c) => c.temp_id === tempId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /** Duplicating copies the recipe, never the identity — the copy is a new component. */
  function duplicateComponent(tempId: string) {
    if (readOnly) return;
    setComponents((cs) => {
      const i = cs.findIndex((c) => c.temp_id === tempId);
      if (i < 0) return cs;
      const src = cs[i];
      const copy: DraftComponent = {
        temp_id: crypto.randomUUID(),
        id: null,
        name: `${src.name} copy`,
        component_type: src.component_type,
        lines: src.lines.map((l) => ({ ...l, temp_id: crypto.randomUUID() })),
      };
      return [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)];
    });
  }

  /** Removing a component keeps its lines — they fall back to ungrouped, never deleted. */
  function removeComponent(tempId: string) {
    if (readOnly) return;
    const target = components.find((c) => c.temp_id === tempId);
    if (!target) return;
    if (target.lines.length) {
      const ok = window.confirm(
        `"${target.name || "This component"}" has ${target.lines.length} line${target.lines.length === 1 ? "" : "s"}.

` +
          "Removing the component keeps those lines on the BOM — they move to Ungrouped. Continue?"
      );
      if (!ok) return;
    }
    if (target.id) setRemovedComponentIds((ids) => [...ids, target.id as string]);
    setUngrouped((ls) => [...ls, ...target.lines]);
    setComponents((cs) => cs.filter((c) => c.temp_id !== tempId));
  }

  const componentCost = (c: DraftComponent) => c.lines.reduce((sum, l) => sum + calcLineCost(l), 0);

  // Same split the costing engine uses: packaging by line type, case-insensitive.
  const isPackagingLine = (l: DraftLine) => String(l.line_type || "").trim().toLowerCase() === "packaging";
  const packagingCostTotal = useMemo(
    () => lines.filter(isPackagingLine).reduce((sum, l) => sum + calcLineCost(l), 0),
    [lines]
  );
  const ingredientCostTotal = useMemo(
    () => lines.filter((l) => !isPackagingLine(l)).reduce((sum, l) => sum + calcLineCost(l), 0),
    [lines]
  );

  function validate() {
    if (!bomName.trim()) return "BOM name is required.";
    if (!numericYield || numericYield <= 0) return "Yield quantity must be more than 0.";
    const bad = lines.find((line) => !line.line_name.trim() || Number(line.quantity || 0) <= 0);
    if (bad) return "Every line must have a name and quantity greater than 0.";
    const unnamed = components.find((c) => !c.name.trim());
    if (unnamed) return "Every component needs a name.";
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
      const header = {
        recipe_name: bomName.trim(),
        category,
        yield_qty: numericYield,
        yield_unit: yieldUnit || "unit",
        target_gp: numericTargetGp,
        selling_price: numericSelling,
        status,
        product_id: bomPurpose === "Sub-BOM" ? null : productId || null,
        bom_purpose: bomPurpose,
      };

      /*
       * Lines reference the component they belong to, so the components have to
       * exist first. Save the header, reconcile the components to get their real
       * ids, then save the lines pointing at them.
       */
      const headerRes = await fetch(isEdit ? `/api/recipes/${resolvedRecipeId}` : "/api/recipes", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? header : { ...header, lines: [] }),
      });
      const headerData = await headerRes.json();
      if (!headerData.ok) throw new Error(headerData.error || "BOM save failed.");
      const savedId: string = headerData.recipe?.id || resolvedRecipeId;

      for (const componentId of removedComponentIds) {
        await fetch(`/api/recipes/${savedId}/components/${componentId}`, { method: "DELETE" });
      }

      const idByTemp = new Map<string, string>();
      for (const [index, component] of components.entries()) {
        const body = {
          name: component.name.trim(),
          component_type: component.component_type,
          sort_order: componentSortOrder(index),
        };
        if (component.id) {
          const res = await fetch(`/api/recipes/${savedId}/components/${component.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const out = await res.json();
          if (!out.ok) throw new Error(out.error || `Could not save component "${component.name}".`);
          idByTemp.set(component.temp_id, component.id);
        } else {
          const res = await fetch(`/api/recipes/${savedId}/components`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const out = await res.json();
          if (!out.ok) throw new Error(out.error || `Could not create component "${component.name}".`);
          idByTemp.set(component.temp_id, out.component.id);
        }
      }

      const orderedLines = [
        ...components.flatMap((component, ci) =>
          component.lines.map((line, li) => ({
            line,
            component_id: idByTemp.get(component.temp_id) ?? null,
            sort_order: componentSortOrder(ci) + li,
          }))
        ),
        ...ungrouped.map((line, li) => ({ line, component_id: null, sort_order: 9000 + li })),
      ];

      const response = await fetch(`/api/recipes/${savedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...header,
          lines: orderedLines.map(({ line, component_id, sort_order }) => ({
            line_type: line.line_type,
            ingredient_id: line.child_bom_id ? null : line.ingredient_id || null,
            child_bom_id: line.child_bom_id || null,
            component_id,
            line_name: line.line_name.trim(),
            quantity: Number(line.quantity || 0),
            unit: line.unit || "unit",
            unit_cost: Number(line.unit_cost || 0),
            wastage_percent: Number(line.wastage_percent || 0),
            sort_order,
          })),
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "BOM save failed.");
      setRemovedComponentIds([]);

      /*
       * The pack photo comes across last, once the new BOM exists to hang it on.
       * A draft has no id, so there is nothing to attach it to before this
       * point. The photo is a convenience, not part of the costing, so failing
       * to copy it says so and leaves the saved BOM alone rather than undoing
       * work the user has just done.
       */
      let photoNote = "";
      if (isCopy && copyImage && copyFromId && savedId) {
        try {
          const imgRes = await fetch(`/api/recipes/${savedId}/image/copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceBomId: copyFromId }),
          });
          const imgData = await imgRes.json();
          if (!imgData.ok) photoNote = " The pack photo could not be copied — add it from this BOM.";
        } catch {
          photoNote = " The pack photo could not be copied — add it from this BOM.";
        }
      }

      const linkedCount = Number(data.linkedProducts || 0);
      setMessage(
        `${isCopy ? "New BOM created." : "BOM saved."}` +
          `${linkedCount ? ` ${linkedCount} product cost(s) updated.` : ""}${photoNote}`
      );
      if (!isEdit && savedId) {
        router.push(`/recipes/${savedId}`);
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
                  <Save size={18} /> {saving ? "Saving..." : isCopy ? "Save as New BOM" : "Save BOM"}
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

              <div className="md:col-span-2">
                <RecipeImageField recipeId={resolvedRecipeId} canEdit={canSave} labelClass={labelClass} />
              </div>

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

              <div className="block sm:col-span-2">
                <span className={labelClass}>BOM Purpose</span>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {BOM_PURPOSES.map((purpose) => (
                    <label
                      key={purpose}
                      className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                        bomPurpose === purpose
                          ? "border-violet-400 bg-violet-50"
                          : "border-slate-200 bg-white hover:border-violet-200"
                      } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <input
                        type="radio"
                        name="bom-purpose"
                        className="mt-1 h-4 w-4"
                        disabled={readOnly}
                        checked={bomPurpose === purpose}
                        onChange={() => setBomPurpose(purpose)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">{BOM_PURPOSE_LABELS[purpose]}</span>
                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                          {BOM_PURPOSE_DESCRIPTIONS[purpose]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {bomPurpose === "Finished Good" ? (
                <label className="block">
                  <span className={labelClass}>Finished Product</span>
                  <select disabled={readOnly} value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
                    <option value="">Select finished product (optional)</option>
                    {products.map((product) => {
                      // A product belongs to one BOM. One already produced by a
                      // different BOM is listed but cannot be taken, so a copy
                      // can never quietly inherit the original's product.
                      const takenByAnother =
                        Boolean(product.linked_bom_id) && product.linked_bom_id !== resolvedRecipeId;
                      return (
                        <option key={product.id} value={product.id} disabled={takenByAnother}>
                          {product.product_name}
                          {takenByAnother ? " — already produced by another BOM" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <FieldHint example="Handcrafted Chicken Pie">
                    On save, linked product costs update from this BOM. A finished product is what production receives into stock.
                  </FieldHint>
                </label>
              ) : (
                <div className="block">
                  <span className={labelClass}>Finished Product</span>
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                    Not applicable to a Sub-BOM
                  </p>
                  <FieldHint example="Salmon Roses">
                    A Sub-BOM is used inside another BOM, so it is not sold on its own and holds no finished-goods stock.
                  </FieldHint>
                </div>
              )}
            </div>
          </div>

          {isCopy && !message ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
              <p className="text-sm font-black text-sky-900">Copy of an existing BOM — nothing is saved yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Change anything you like. The BOM you copied from is not affected, and leaving this page without
                saving creates nothing.
                {copyImage ? " The pack photo is copied across when you save." : ""}
              </p>
            </div>
          ) : null}
          {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-bold text-[#7E22CE]">{message}</div>}
          {errorMessage && <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{errorMessage}</div>}

          {/* Section 3 — Components */}
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_18px_50px_rgba(81,63,190,0.08)] sm:p-6 md:p-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]">
                  <Layers size={24} />
                </div>
                <div>
                  <div className={labelClass}>Section 3</div>
                  <h3 className="text-2xl font-black text-slate-900">Components</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Build the pack the way it is made — one component per part, with its own ingredients.
                  </p>
                </div>
              </div>
              {canSave ? (
                <button
                  type="button"
                  onClick={addComponent}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white"
                >
                  <Plus size={18} />
                  Add Component
                </button>
              ) : null}
            </div>

            {components.length === 0 && ungrouped.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
                <p className="text-sm font-black text-slate-900">No components yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-slate-500">
                  A pack is built from components — for example Salmon &amp; Avo Cali, Salmon maki, Condiments and
                  Packaging. Add the first one, then put its ingredients inside it.
                </p>
                {canSave ? (
                  <button
                    type="button"
                    onClick={addComponent}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white"
                  >
                    <Plus size={18} />
                    Add your first component
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4">
              {components.map((component, index) => {
                const isPackaging = component.component_type.trim().toLowerCase() === "packaging";
                return (
                  <div key={component.temp_id} className="overflow-hidden rounded-2xl border border-violet-100">
                    <div className="flex flex-col gap-3 bg-violet-50 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
                            Component name
                          </span>
                          <input
                            disabled={readOnly}
                            value={component.name}
                            onChange={(e) => patchComponent(component.temp_id, { name: e.target.value })}
                            placeholder="e.g. Salmon maki"
                            className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none focus:border-violet-400"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
                            Type
                          </span>
                          <select
                            disabled={readOnly}
                            value={component.component_type}
                            onChange={(e) => patchComponent(component.temp_id, { component_type: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-800 outline-none focus:border-violet-400"
                          >
                            {componentTypes.map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="flex items-center justify-between gap-2 lg:justify-end">
                        <div className="text-right">
                          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
                            {isPackaging ? "Packaging cost" : "Component cost"}
                          </div>
                          <div className="text-lg font-black text-violet-700">{formatMoney(componentCost(component))}</div>
                          <div className="text-[0.65rem] font-bold text-slate-500">
                            {component.lines.length} {isPackaging ? (component.lines.length === 1 ? "item" : "items") : component.lines.length === 1 ? "ingredient" : "ingredients"}
                          </div>
                        </div>
                        {canSave ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${component.name || "component"} up`}
                              disabled={index === 0}
                              onClick={() => moveComponent(component.temp_id, -1)}
                              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 disabled:opacity-40"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${component.name || "component"} down`}
                              disabled={index === components.length - 1}
                              onClick={() => moveComponent(component.temp_id, 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 disabled:opacity-40"
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Duplicate ${component.name || "component"}`}
                              onClick={() => duplicateComponent(component.temp_id)}
                              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${component.name || "component"}`}
                              onClick={() => removeComponent(component.temp_id)}
                              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {component.lines.length === 0 ? (
                        <p className="px-4 py-5 text-sm font-semibold text-slate-500 sm:px-5">
                          Nothing in this component yet.
                        </p>
                      ) : null}
                      {component.lines.map((line) => (
                        <div key={line.temp_id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
                          {/*
                            A line standing for another BOM is not searched for
                            in the ingredient master, so it shows what it is
                            instead of an item lookup. The BOM is named, never
                            its id.
                          */}
                          {line.child_bom_id ? (
                            <div className="block lg:col-span-1">
                              <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">
                                BOM
                              </span>
                              <div className="mt-1 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                                <Layers size={16} className="shrink-0 text-violet-600" />
                                <span className="min-w-0 truncate text-sm font-black text-violet-900">
                                  {line.child_bom_name || line.line_name}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <label className="block lg:col-span-1">
                              <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500 lg:hidden">
                                {isPackaging ? "Packaging item" : "Ingredient"}
                              </span>
                              <ItemLookupField
                                initialValue={line.line_name}
                                defaultType={isPackaging || line.line_type === "Packaging" ? "packaging" : "ingredient"}
                                onSelect={(item) => selectIngredientFromLookup(line.temp_id, item)}
                              />
                            </label>
                          )}
                          <label className="block">
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Qty</span>
                            <input
                              disabled={readOnly}
                              type="number"
                              step="0.000001"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.temp_id, "quantity", Number(e.target.value))}
                              className={`mt-1 w-full ${lineInputClass}`}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Unit</span>
                            <input
                              disabled={readOnly || Boolean(line.child_bom_id)}
                              value={line.unit}
                              onChange={(e) => updateLine(line.temp_id, "unit", e.target.value)}
                              className={`mt-1 w-full ${lineInputClass}`}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Unit cost</span>
                            <input
                              /* A sub-BOM's unit cost is the child BOM's cost per unit and is
                                 re-read on every save, so it is shown rather than typed —
                                 editing it here would be overwritten anyway. */
                              disabled={readOnly || Boolean(line.child_bom_id)}
                              type="number"
                              step="0.00000001"
                              value={line.unit_cost}
                              onChange={(e) => updateLine(line.temp_id, "unit_cost", Number(e.target.value))}
                              className={`mt-1 w-full ${lineInputClass}`}
                            />
                            {line.child_bom_id ? (
                              <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">
                                From the BOM&rsquo;s cost per unit
                              </span>
                            ) : null}
                          </label>
                          <div className="lg:text-right">
                            <span className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Line cost</span>
                            <div className="mt-1 text-sm font-black text-slate-900">{formatMoney(calcLineCost(line))}</div>
                          </div>
                          {canSave ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setMovingLine(movingLine === line.temp_id ? null : line.temp_id)}
                                className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                              >
                                Move
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${line.line_name || "line"}`}
                                onClick={() => removeLine(line.temp_id)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : null}

                          {movingLine === line.temp_id ? (
                            <div className="rounded-2xl border border-violet-200 bg-white p-4 lg:col-span-6">
                              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                                Move &ldquo;{line.line_name || "this line"}&rdquo; to
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {components
                                  .filter((c) => c.temp_id !== component.temp_id)
                                  .map((c) => (
                                    <button
                                      key={c.temp_id}
                                      type="button"
                                      onClick={() => moveLineToComponent(line.temp_id, c.temp_id)}
                                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800"
                                    >
                                      {c.name || "Untitled component"}
                                    </button>
                                  ))}
                                <button
                                  type="button"
                                  onClick={() => setMovingLine(null)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {canSave ? (
                      <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                        <button
                          type="button"
                          onClick={() => addLineTo(component.temp_id, isPackaging ? "Packaging" : "Ingredient")}
                          className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-700"
                        >
                          <Plus size={16} />
                          {isPackaging ? "Add Packaging" : "Add Ingredient"}
                        </button>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => void openBomPicker(component.temp_id)}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-black text-violet-700 disabled:opacity-60"
                        >
                          <Layers size={15} />
                          Add BOM
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {ungrouped.length ? (
                <div className="overflow-hidden rounded-2xl border border-amber-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-4 py-4 sm:px-5">
                    <div>
                      <div className="text-sm font-black text-slate-900">Ungrouped lines</div>
                      <div className="text-xs font-bold text-slate-500">
                        {ungrouped.length} line{ungrouped.length === 1 ? "" : "s"} not in a component yet — move them into one above.
                      </div>
                    </div>
                    <div className="text-lg font-black text-amber-700">
                      {formatMoney(ungrouped.reduce((sum, l) => sum + calcLineCost(l), 0))}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ungrouped.map((line) => (
                      <div key={line.temp_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-900">{line.line_name || "Unnamed line"}</div>
                          <div className="text-xs font-bold text-slate-500">
                            {line.quantity} {line.unit} · {formatMoney(calcLineCost(line))}
                          </div>
                        </div>
                        {canSave && components.length ? (
                          <div className="flex flex-wrap gap-2">
                            {components.map((c) => (
                              <button
                                key={c.temp_id}
                                type="button"
                                onClick={() => moveLineToComponent(line.temp_id, c.temp_id)}
                                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800"
                              >
                                → {c.name || "Untitled"}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4 sm:grid-cols-3">
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Ingredient cost</div>
                <div className="mt-1 text-xl font-black text-slate-900">{formatMoney(ingredientCostTotal)}</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Packaging cost</div>
                <div className="mt-1 text-xl font-black text-violet-700">{formatMoney(packagingCostTotal)}</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">Total BOM cost</div>
                <div className="mt-1 text-xl font-black text-slate-900">{formatMoney(totalCost)}</div>
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

      {bomPickerFor ? (
        <div
          role="dialog"
          aria-label="Select BOM"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => setBomPickerFor(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-lg font-black text-slate-950">Select BOM</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                The BOM you pick becomes a component of this one. Its cost per unit is used for the line.
              </p>
              <input
                autoFocus
                value={bomSearch}
                onChange={(e) => setBomSearch(e.target.value)}
                placeholder="Search BOM..."
                className="mt-3 min-h-[44px] w-full rounded-xl border border-violet-100 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400"
              />
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-3">
              {bomOptions
                .filter((b) => b.recipe_name.toLowerCase().includes(bomSearch.trim().toLowerCase()))
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => addBomLineTo(bomPickerFor, b)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-violet-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">{b.recipe_name}</span>
                      <span className="text-xs font-bold text-slate-500">
                        {b.bom_purpose === "Sub-BOM" ? "Sub-BOM / Assembly" : "Finished Good"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-black text-violet-700">{formatMoney(b.cost_per_unit)}</span>
                  </button>
                ))}
              {!bomOptions.filter((b) => b.recipe_name.toLowerCase().includes(bomSearch.trim().toLowerCase())).length ? (
                <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500">No other BOM matches.</p>
              ) : null}
            </div>
            <div className="border-t border-slate-100 p-4 text-right">
              <button
                type="button"
                onClick={() => setBomPickerFor(null)}
                className="min-h-[44px] rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
