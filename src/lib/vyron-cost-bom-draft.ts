import type { BomLine } from "@/lib/vyron-cost-bom-data";
import { normaliseBomPurpose, type BomPurpose } from "@/lib/vyron-cost-sub-boms";

/**
 * Turning a stored BOM into the editor's working draft.
 *
 * This lives outside the component so the mapping can be tested directly. It is
 * the mapping that decides whether a line keeps its identity, and getting it
 * wrong is silent: a sub-BOM line that loses its child reference still looks
 * right on screen and still carries its last cost, while the assembly beneath it
 * has quietly become nothing.
 */

export type DraftLineShape = {
  temp_id: string;
  line_type: string;
  ingredient_id: string | null;
  child_bom_id: string | null;
  child_bom_name: string | null;
  component_id: string | null;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  sort_order: number;
};

export type DraftComponentShape = {
  temp_id: string;
  id: string | null;
  name: string;
  component_type: string;
  lines: DraftLineShape[];
};

export type CopyDraft = {
  bom_name: string;
  category: string;
  yield_qty: string;
  yield_unit: string;
  target_gp: string;
  selling_price: string;
  status: string;
  product_id: string;
  bom_purpose: BomPurpose;
  components: DraftComponentShape[];
  ungrouped: DraftLineShape[];
};

/** One stored line as the editor holds it. Identity fields are carried, not rebuilt. */
export function toDraftLine(
  line: BomLine,
  index: number,
  newId: () => string,
  componentIdFor?: (sourceComponentId: string | null) => string | null
): DraftLineShape {
  const sourceComponentId = line.component_id ?? null;
  return {
    temp_id: newId(),
    line_type: line.line_type || "Ingredient",
    ingredient_id: line.ingredient_id || null,
    // A sub-BOM line's whole meaning is this reference.
    child_bom_id: line.child_bom_id ?? null,
    child_bom_name: line.child_bom_name ?? null,
    component_id: componentIdFor ? componentIdFor(sourceComponentId) : sourceComponentId,
    line_name: line.line_name || "",
    quantity: Number(line.quantity || 0),
    unit: line.unit || "unit",
    unit_cost: Number(line.unit_cost || 0),
    wastage_percent: Number(line.wastage_percent || 0),
    sort_order: line.sort_order ?? index,
  };
}

export type SourceComponent = { id: string; name: string; component_type?: string | null };

/**
 * Build the whole Copy & Edit draft.
 *
 * Every component is given a fresh temporary identity with `id: null`. That null
 * is what makes the copy safe: the save path creates a component when there is
 * no id and PATCHes the existing one when there is, so carrying the source's id
 * across would rename the original's components. Ingredient and child BOM
 * references are kept as they are — both are shared master records.
 */
export function buildCopyDraft(
  recipe: {
    bom_name?: string | null;
    recipe_name?: string | null;
    category?: string | null;
    yield_qty?: number | null;
    yield_unit?: string | null;
    target_gp?: number | null;
    selling_price?: number | null;
    bom_purpose?: string | null;
    components?: SourceComponent[] | null;
  },
  lines: BomLine[],
  newId: () => string
): CopyDraft {
  const sourceComponents = recipe.components || [];
  const tempBySourceId = new Map<string, string>();
  for (const c of sourceComponents) tempBySourceId.set(String(c.id), newId());

  const drafts = lines.map((line, index) =>
    toDraftLine(line, index, newId, (sourceId) => (sourceId ? tempBySourceId.get(String(sourceId)) ?? null : null))
  );

  const components: DraftComponentShape[] = sourceComponents.map((c) => {
    const temp = tempBySourceId.get(String(c.id))!;
    return {
      temp_id: temp,
      id: null,
      name: c.name,
      component_type: c.component_type || "Product Component",
      lines: drafts.filter((l) => l.component_id === temp),
    };
  });

  return {
    bom_name: `${recipe.bom_name || recipe.recipe_name || ""} (Copy)`,
    category: recipe.category || "General",
    yield_qty: String(recipe.yield_qty || 1),
    yield_unit: recipe.yield_unit || "unit",
    target_gp: String(recipe.target_gp || 40),
    selling_price: String(recipe.selling_price || 0),
    // A copy has produced nothing and is nobody's product yet.
    status: "Draft",
    product_id: "",
    bom_purpose: normaliseBomPurpose(recipe.bom_purpose),
    components,
    ungrouped: drafts.filter((l) => !l.component_id),
  };
}
