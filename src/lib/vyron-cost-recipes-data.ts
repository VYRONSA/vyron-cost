import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcGp, calcLineCost, calcSuggestedPrice } from "@/lib/vyron-cost-bom-data";
import {
  assertNoCircularBom,
  BomInUseError,
  findParentBoms,
  loadChildBoms,
  normaliseBomPurpose,
  SUB_BOM_LINE_TYPE,
  type BomPurpose,
} from "@/lib/vyron-cost-sub-boms";

export type RecipeLineInput = {
  id?: string;
  line_type: string;
  ingredient_id?: string | null;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent?: number;
  sort_order?: number;
  /** Owning component within this same BOM. Null leaves the line ungrouped. */
  component_id?: string | null;
  /** The BOM this line stands for. Mutually exclusive with ingredient_id. */
  child_bom_id?: string | null;
};

/**
 * A named part of one pack — "Salmon maki", "Condiments", "Packaging".
 *
 * Components are local to their parent BOM. The same name appears in many packs
 * with different ingredients and quantities, so components are never shared or
 * linked between BOMs and there is no global component master.
 */
export type RecipeComponentRecord = {
  id: string;
  company_id: string | null;
  bom_id: string;
  name: string;
  component_type: string;
  sort_order: number;
  yield_qty: number | null;
  yield_unit: string | null;
  notes: string | null;
};

export const RECIPE_COMPONENT_TYPES = ["Product Component", "Condiment", "Packaging", "Other"] as const;

export type RecipeRecord = {
  id: string;
  company_id: string | null;
  recipe_name: string;
  category: string | null;
  yield_qty: number;
  yield_unit: string | null;
  target_gp: number | null;
  selling_price: number | null;
  total_cost: number;
  ingredient_cost: number | null;
  packaging_cost: number | null;
  cost_per_unit: number;
  calculated_gp: number | null;
  suggested_selling_price: number | null;
  status: string | null;
  notes: string | null;
  product_id: string | null;
  /** What this BOM is for. Not inferred from product_id. */
  bom_purpose: BomPurpose;
  /** Storage reference for the pack photo; the bytes live in the documents bucket. */
  image_bucket: string | null;
  image_path: string | null;
  image_mime: string | null;
  lines?: RecipeLineRecord[];
  components?: RecipeComponentRecord[];
};

export type RecipeLineRecord = {
  id: string;
  recipe_id: string;
  company_id: string | null;
  line_type: string;
  ingredient_id: string | null;
  component_id: string | null;
  /** Set when this line stands for another BOM. Never set with ingredient_id. */
  child_bom_id: string | null;
  /** Display-only detail about the child BOM; not stored on the line. */
  child_bom_name?: string | null;
  child_bom_purpose?: BomPurpose | null;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  line_cost: number;
  sort_order: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function round8(n: number) {
  return Math.round(n * 100000000) / 100000000;
}

/**
 * Packaging is recorded on the BOM line type, and the data has been written in
 * mixed casing over time ("Packaging" and "packaging" both exist in production),
 * so the split must be case-insensitive. `idx_vyron_cost_bom_lines_type` is
 * already built on lower(line_type), so the database agrees with this reading.
 */
export function isPackagingLine(line: { line_type?: string | null }) {
  return String(line.line_type || "").trim().toLowerCase() === "packaging";
}

function lineCostInput(line: RecipeLineInput) {
  return {
    quantity: Number(line.quantity || 0),
    unit_cost: Number(line.unit_cost || 0),
    wastage_percent: Number(line.wastage_percent ?? 0),
  };
}

function isMissingUpdatedAtError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return code === "42703" || (message.includes("column") && message.includes("updated_at"));
}

function isMissingColumnError(error: unknown, column: string) {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return code === "42703" || (message.includes("column") && message.includes(column.toLowerCase()));
}

export function computeRecipeCosts(
  lines: RecipeLineInput[],
  yieldQty: number,
  sellingPrice: number,
  targetGp: number
) {
  /**
   * total_cost keeps the meaning it has always had — every line, packaging
   * included — so no existing recipe total moves. ingredient_cost and
   * packaging_cost are additive detail: the costing workbooks quote food cost
   * and packaging as separate figures, and collapsing them into one number lost
   * information the business actually prices against.
   */
  const ingredientCost = round8(
    lines
      .filter((line) => !isPackagingLine(line))
      .reduce((sum, line) => sum + calcLineCost(lineCostInput(line)), 0)
  );
  const packagingCost = round8(
    lines
      .filter((line) => isPackagingLine(line))
      .reduce((sum, line) => sum + calcLineCost(lineCostInput(line)), 0)
  );
  const totalCost = round2(ingredientCost + packagingCost);
  const numericYield = Math.max(1, Number(yieldQty || 1));
  const costPerUnit = round4(totalCost / numericYield);
  const calculatedGp = round2(calcGp(sellingPrice, costPerUnit));
  const suggestedSellingPrice = round2(calcSuggestedPrice(costPerUnit, targetGp));
  return { totalCost, ingredientCost, packagingCost, costPerUnit, calculatedGp, suggestedSellingPrice };
}

function mapBomRow(row: Record<string, unknown>, lines?: RecipeLineRecord[]): RecipeRecord {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    recipe_name: String(row.bom_name || ""),
    category: row.category ? String(row.category) : null,
    yield_qty: Number(row.yield_qty || 1),
    yield_unit: row.yield_unit ? String(row.yield_unit) : "unit",
    target_gp: row.target_gp != null ? Number(row.target_gp) : null,
    selling_price: row.selling_price != null ? Number(row.selling_price) : null,
    total_cost: Number(row.total_cost || 0),
    ingredient_cost: row.ingredient_cost != null ? Number(row.ingredient_cost) : null,
    packaging_cost: row.packaging_cost != null ? Number(row.packaging_cost) : null,
    cost_per_unit: Number(row.cost_per_unit || 0),
    calculated_gp: row.calculated_gp != null ? Number(row.calculated_gp) : null,
    suggested_selling_price: row.suggested_selling_price != null ? Number(row.suggested_selling_price) : null,
    status: row.status ? String(row.status) : "Draft",
    notes: row.notes ? String(row.notes) : null,
    product_id: row.product_id ? String(row.product_id) : null,
    bom_purpose: normaliseBomPurpose(row.bom_purpose),
    image_bucket: row.image_bucket ? String(row.image_bucket) : null,
    image_path: row.image_path ? String(row.image_path) : null,
    image_mime: row.image_mime ? String(row.image_mime) : null,
    lines,
  };
}

function mapLineRow(row: Record<string, unknown>): RecipeLineRecord {
  return {
    id: String(row.id),
    recipe_id: String(row.bom_id),
    company_id: row.company_id ? String(row.company_id) : null,
    line_type: String(row.line_type || "Ingredient"),
    ingredient_id: row.ingredient_id ? String(row.ingredient_id) : null,
    component_id: row.component_id ? String(row.component_id) : null,
    child_bom_id: row.child_bom_id ? String(row.child_bom_id) : null,
    line_name: String(row.line_name || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || "kg"),
    unit_cost: Number(row.unit_cost || 0),
    wastage_percent: Number(row.wastage_percent || 0),
    line_cost: Number(
      row.line_cost ||
        calcLineCost({
          quantity: Number(row.quantity || 0),
          unit_cost: Number(row.unit_cost || 0),
          wastage_percent: Number(row.wastage_percent || 0),
        })
    ),
    sort_order: Number(row.sort_order || 0),
  };
}

export type RecipeListFilters = {
  /** Matched against bom_name. */
  name?: string;
  /** Exact category match, as offered by listRecipeCategories(). */
  category?: string;
  /**
   * Matched against notes. vyron_cost_boms has no `description` column — notes
   * is the BOM's free-text field, so that is what the description filter reads.
   */
  description?: string;
};

/**
 * `%` and `_` are wildcards to ILIKE, so a user typing them would silently widen
 * their own search. Escape them, and the escape character itself, so the filter
 * matches the literal text that was typed.
 */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Filtering runs in the database rather than over the already-loaded page, so a
 * search reaches every recipe the tenant owns and not just the ones on screen.
 */
export async function listRecipes(
  supabase: SupabaseClient,
  companyId: string,
  includeArchived = false,
  filters: RecipeListFilters = {}
) {
  let query = supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("company_id", companyId)
    .order("bom_name");
  if (!includeArchived) {
    query = query.neq("status", "Archived");
  }

  const name = filters.name?.trim();
  if (name) query = query.ilike("bom_name", `%${escapeLike(name)}%`);

  const category = filters.category?.trim();
  if (category) query = query.eq("category", category);

  const description = filters.description?.trim();
  if (description) query = query.ilike("notes", `%${escapeLike(description)}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapBomRow(row as Record<string, unknown>));
}

/**
 * The category options come from the tenant's own recipes, so the dropdown can
 * never offer a category that matches nothing — or omit one that does.
 */
export async function listRecipeCategories(
  supabase: SupabaseClient,
  companyId: string,
  includeArchived = false
) {
  let query = supabase
    .from("vyron_cost_boms")
    .select("category")
    .eq("company_id", companyId);
  if (!includeArchived) {
    query = query.neq("status", "Archived");
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  for (const row of data || []) {
    const value = String((row as { category?: unknown }).category ?? "").trim();
    if (value) seen.add(value);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export async function getRecipe(supabase: SupabaseClient, companyId: string, recipeId: string) {
  const { data: bom, error } = await supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bom) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_bom_lines")
    .select("*")
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });
  if (lineError) throw new Error(lineError.message);

  const components = await listRecipeComponents(supabase, companyId, recipeId);

  return {
    ...mapBomRow(
      bom as Record<string, unknown>,
      (lines || []).map((line) => mapLineRow(line as Record<string, unknown>))
    ),
    components,
  };
}

function mapComponentRow(row: Record<string, unknown>): RecipeComponentRecord {
  return {
    id: String(row.id),
    company_id: row.company_id ? String(row.company_id) : null,
    bom_id: String(row.bom_id),
    name: String(row.name || ""),
    component_type: String(row.component_type || "Product Component"),
    sort_order: Number(row.sort_order || 0),
    yield_qty: row.yield_qty != null ? Number(row.yield_qty) : null,
    yield_unit: row.yield_unit ? String(row.yield_unit) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

/**
 * Every component query is scoped by company_id AND bom_id, so a component can
 * only ever be reached through a parent BOM the verified workspace owns.
 */
export async function listRecipeComponents(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string
): Promise<RecipeComponentRecord[]> {
  const { data, error } = await supabase
    .from("vyron_cost_bom_components")
    .select("*")
    .eq("company_id", companyId)
    .eq("bom_id", recipeId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapComponentRow(row as Record<string, unknown>));
}

export async function createRecipeComponent(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  input: { name: string; component_type?: string; sort_order?: number; yield_qty?: number | null; yield_unit?: string | null; notes?: string | null }
) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Component name is required.");

  // Confirm the parent BOM belongs to this tenant before attaching anything.
  const { data: bom, error: bomError } = await supabase
    .from("vyron_cost_boms")
    .select("id")
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (bomError) throw new Error(bomError.message);
  if (!bom) throw new Error("Recipe not found.");

  const existing = await listRecipeComponents(supabase, companyId, recipeId);
  const nextOrder =
    input.sort_order ?? (existing.length ? Math.max(...existing.map((c) => c.sort_order)) + 10 : 10);

  const { data, error } = await supabase
    .from("vyron_cost_bom_components")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      bom_id: recipeId,
      name,
      component_type: input.component_type || "Product Component",
      sort_order: nextOrder,
      yield_qty: input.yield_qty ?? null,
      yield_unit: input.yield_unit ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapComponentRow(data as Record<string, unknown>);
}

export async function updateRecipeComponent(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  componentId: string,
  input: { name?: string; component_type?: string; sort_order?: number; yield_qty?: number | null; yield_unit?: string | null; notes?: string | null }
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw new Error("Component name is required.");
    patch.name = name;
  }
  if (input.component_type !== undefined) patch.component_type = input.component_type;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.yield_qty !== undefined) patch.yield_qty = input.yield_qty;
  if (input.yield_unit !== undefined) patch.yield_unit = input.yield_unit;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("vyron_cost_bom_components")
    .update(patch)
    .eq("id", componentId)
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Component not found.");
  return mapComponentRow(data as Record<string, unknown>);
}

/**
 * Deleting a component leaves its lines in place and ungrouped — the schema's
 * ON DELETE SET NULL. Costing is unaffected, so removing a grouping can never
 * silently destroy cost data.
 */
export async function deleteRecipeComponent(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  componentId: string
) {
  /**
   * Select the deleted row back so a delete that matched nothing — a wrong
   * tenant, a wrong BOM, an id that no longer exists — reports not-found
   * instead of a misleading success.
   */
  const { data, error } = await supabase
    .from("vyron_cost_bom_components")
    .delete()
    .eq("id", componentId)
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Component not found.");
  return { ok: true };
}

async function syncLinkedProducts(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  totalCost: number,
  costPerUnit: number,
  productId?: string | null,
  previousProductId?: string | null
) {
  if (previousProductId && previousProductId !== productId) {
    let unlinkResponse = await supabase
      .from("vyron_cost_products")
      .update({ linked_bom_id: null, updated_at: new Date().toISOString() })
      .eq("id", previousProductId)
      .eq("company_id", companyId)
      .eq("linked_bom_id", recipeId);
    if (unlinkResponse.error && isMissingUpdatedAtError(unlinkResponse.error)) {
      unlinkResponse = await supabase
        .from("vyron_cost_products")
        .update({ linked_bom_id: null })
        .eq("id", previousProductId)
        .eq("company_id", companyId)
        .eq("linked_bom_id", recipeId);
    }
    if (unlinkResponse.error) throw new Error(unlinkResponse.error.message);
  }

  const ids = new Set<string>();
  if (productId) ids.add(productId);

  const { data: linkedByBom } = await supabase
    .from("vyron_cost_products")
    .select("id, selling_price, target_gp")
    .eq("company_id", companyId)
    .eq("linked_bom_id", recipeId);
  for (const row of linkedByBom || []) ids.add(String(row.id));

  const productById = new Map(
    (linkedByBom || []).map((row) => [String(row.id), row as { selling_price?: number; target_gp?: number }])
  );
  const missingIds = [...ids].filter((id) => !productById.has(id));
  if (missingIds.length) {
    const { data: linkedById } = await supabase
      .from("vyron_cost_products")
      .select("id, selling_price, target_gp")
      .eq("company_id", companyId)
      .in("id", missingIds);
    for (const row of linkedById || []) {
      productById.set(String(row.id), row as { selling_price?: number; target_gp?: number });
    }
  }

  for (const id of ids) {
    const product = productById.get(id);
    const selling = Number(product?.selling_price || 0);
    const target = Number(product?.target_gp || 40);
    const basePatch = {
      linked_bom_id: recipeId,
      total_cost: costPerUnit,
      cost_per_unit: costPerUnit,
      calculated_gp: calcGp(selling, costPerUnit),
      actual_gp: calcGp(selling, costPerUnit),
      suggested_selling_price: calcSuggestedPrice(costPerUnit, target),
      updated_at: new Date().toISOString(),
    };

    let updateResponse = await supabase
      .from("vyron_cost_products")
      .update(basePatch)
      .eq("id", id)
      .eq("company_id", companyId);

    if (
      updateResponse.error &&
      (isMissingUpdatedAtError(updateResponse.error) || isMissingColumnError(updateResponse.error, "cost_per_unit"))
    ) {
      const retryPatch: Record<string, unknown> = { ...basePatch };
      if (isMissingUpdatedAtError(updateResponse.error)) delete retryPatch.updated_at;
      if (isMissingColumnError(updateResponse.error, "cost_per_unit")) delete retryPatch.cost_per_unit;

      updateResponse = await supabase
        .from("vyron_cost_products")
        .update(retryPatch)
        .eq("id", id)
        .eq("company_id", companyId);
    }

    if (updateResponse.error) throw new Error(updateResponse.error.message);
  }

  return ids.size;
}

async function insertRecipeLines(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  lines: RecipeLineInput[]
) {
  if (!lines.length) return [] as RecipeLineRecord[];

  const rows = lines
    .filter((line) => line.line_name?.trim())
    .map((line, index) => ({
      id: line.id || randomUUID(),
      company_id: companyId,
      bom_id: recipeId,
      line_type: line.line_type || "Ingredient",
      // A line is an ingredient or an assembly, never both — the database
      // enforces the same rule, so sending both would be refused outright.
      ingredient_id: line.child_bom_id ? null : line.ingredient_id || null,
      child_bom_id: line.child_bom_id || null,
      // Carried through so a save that rewrites lines keeps their grouping.
      component_id: line.component_id || null,
      line_name: line.line_name.trim(),
      quantity: Number(line.quantity || 0),
      unit: line.unit || "kg",
      unit_cost: Number(line.unit_cost || 0),
      wastage_percent: Number(line.wastage_percent || 0),
      sort_order: line.sort_order ?? index,
    }));

  const { data, error } = await supabase.from("vyron_cost_bom_lines").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return (data || []).map((line) => mapLineRow(line as Record<string, unknown>));
}

/**
 * Price the sub-BOM lines and refuse any that would close a loop.
 *
 * A sub-BOM line carries the child's cost per unit in its own unit_cost, so from
 * here on it is arithmetically an ordinary line: computeRecipeCosts multiplies
 * quantity by unit cost by wastage exactly as it always has. That is why a BOM
 * with no child BOMs produces byte-identical costing to before — it never enters
 * this function's loop at all.
 *
 * Every child is checked for cycles before anything is written, so a refused
 * save leaves nothing behind.
 */
async function resolveSubBomLines(
  supabase: SupabaseClient,
  companyId: string,
  parentBomId: string | null,
  lines: RecipeLineInput[]
): Promise<RecipeLineInput[]> {
  const childIds = lines.map((l) => l.child_bom_id).filter(Boolean) as string[];
  if (!childIds.length) return lines;

  const children = await loadChildBoms(supabase, companyId, childIds);

  for (const id of new Set(childIds)) {
    if (!children.has(id)) {
      // Not visible under this company — another tenant's BOM, or deleted.
      throw new Error("That BOM could not be found in this workspace.");
    }
    if (parentBomId) await assertNoCircularBom(supabase, companyId, parentBomId, id);
  }

  return lines.map((line) => {
    if (!line.child_bom_id) return line;
    const child = children.get(line.child_bom_id)!;
    return {
      ...line,
      line_type: SUB_BOM_LINE_TYPE,
      ingredient_id: null,
      line_name: line.line_name?.trim() || child.bom_name,
      unit: line.unit || child.yield_unit || "unit",
      // The child's own cost per unit. Priced at save time, like every other line.
      unit_cost: child.cost_per_unit,
    };
  });
}

/**
 * A product belongs to one BOM. Refuse to take one that another BOM already
 * costs.
 *
 * syncLinkedProducts sets linked_bom_id and rewrites the product's cost without
 * asking, so saving a copy with the original's product selected would quietly
 * repoint that product at the copy: the original BOM row survives untouched, but
 * the product stops costing from it. This is the check that makes that
 * impossible, and it is deliberately narrow — it fires only when the product is
 * already linked to a *different* BOM, so re-saving a BOM with its own product
 * is unaffected.
 */
export class ProductAlreadyLinkedError extends Error {
  readonly productId: string;
  readonly ownerBomId: string;
  readonly ownerBomName: string;
  constructor(productId: string, ownerBomId: string, ownerBomName: string) {
    super(
      `That finished product is already produced by "${ownerBomName}". ` +
        `Choose a different product, or create a new one for this BOM.`
    );
    this.name = "ProductAlreadyLinkedError";
    this.productId = productId;
    this.ownerBomId = ownerBomId;
    this.ownerBomName = ownerBomName;
  }
}

async function assertProductFree(
  supabase: SupabaseClient,
  companyId: string,
  productId: string | null | undefined,
  bomId: string
) {
  if (!productId) return;
  const { data: product } = await supabase
    .from("vyron_cost_products")
    .select("id, linked_bom_id")
    .eq("company_id", companyId)
    .eq("id", productId)
    .maybeSingle();
  const owner = product?.linked_bom_id ? String(product.linked_bom_id) : null;
  if (!owner || owner === bomId) return;

  const { data: ownerBom } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name")
    .eq("company_id", companyId)
    .eq("id", owner)
    .maybeSingle();
  // A link pointing at a BOM that no longer exists is stale, not a conflict.
  if (!ownerBom) return;
  throw new ProductAlreadyLinkedError(productId, owner, String(ownerBom.bom_name || "another BOM"));
}

export async function createRecipe(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    recipe_name: string;
    category?: string;
    yield_qty?: number;
    yield_unit?: string;
    target_gp?: number;
    selling_price?: number;
    status?: string;
    notes?: string;
    product_id?: string | null;
    bom_purpose?: string | null;
    lines?: RecipeLineInput[];
  }
) {
  const purpose = normaliseBomPurpose(input.bom_purpose);
  const recipeId = randomUUID();

  // Checked before anything is written, so a refusal leaves nothing behind.
  if (purpose !== "Sub-BOM") await assertProductFree(supabase, companyId, input.product_id, recipeId);

  // No parent id exists yet, so a new BOM cannot be part of a cycle; the
  // database still refuses a self-reference.
  const lines = await resolveSubBomLines(supabase, companyId, null, input.lines || []);
  const costs = computeRecipeCosts(
    lines,
    Number(input.yield_qty || 1),
    Number(input.selling_price || 0),
    Number(input.target_gp || 0)
  );

  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .insert({
      id: recipeId,
      company_id: companyId,
      bom_name: input.recipe_name.trim(),
      category: input.category || "General",
      yield_qty: Number(input.yield_qty || 1),
      yield_unit: input.yield_unit || "unit",
      target_gp: Number(input.target_gp || 0),
      selling_price: Number(input.selling_price || 0),
      total_cost: costs.totalCost,
      ingredient_cost: costs.ingredientCost,
      packaging_cost: costs.packagingCost,
      cost_per_unit: costs.costPerUnit,
      calculated_gp: costs.calculatedGp,
      suggested_selling_price: costs.suggestedSellingPrice,
      status: input.status || "Draft",
      notes: input.notes || null,
      // A Sub-BOM keeps product_id null: it is not sold on its own, so it gets
      // no product and no finished-goods stock item.
      product_id: purpose === "Sub-BOM" ? null : input.product_id || null,
      bom_purpose: purpose,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const savedLines = await insertRecipeLines(supabase, companyId, recipeId, lines);
  const linkedProducts = await syncLinkedProducts(
    supabase,
    companyId,
    recipeId,
    costs.totalCost,
    costs.costPerUnit,
    purpose === "Sub-BOM" ? null : input.product_id
  );

  return { recipe: mapBomRow(data as Record<string, unknown>, savedLines), linkedProducts };
}

export async function updateRecipe(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  input: {
    recipe_name?: string;
    category?: string;
    yield_qty?: number;
    yield_unit?: string;
    target_gp?: number;
    selling_price?: number;
    status?: string;
    notes?: string;
    product_id?: string | null;
    bom_purpose?: string | null;
    lines?: RecipeLineInput[];
  }
) {
  const existing = await getRecipe(supabase, companyId, recipeId);
  if (!existing) throw new Error("Recipe not found.");

  const purpose = input.bom_purpose === undefined ? existing.bom_purpose : normaliseBomPurpose(input.bom_purpose);

  const requestedLines =
    input.lines ??
    (existing.lines || []).map((line) => ({
      line_type: line.line_type,
      ingredient_id: line.ingredient_id,
      component_id: line.component_id,
      child_bom_id: line.child_bom_id,
      line_name: line.line_name,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unit_cost,
      wastage_percent: line.wastage_percent,
      sort_order: line.sort_order,
    }));

  if (purpose !== "Sub-BOM" && input.product_id !== undefined) {
    await assertProductFree(supabase, companyId, input.product_id, recipeId);
  }
  const lines = await resolveSubBomLines(supabase, companyId, recipeId, requestedLines);

  const yieldQty = input.yield_qty ?? existing.yield_qty;
  const sellingPrice = input.selling_price ?? Number(existing.selling_price || 0);
  const targetGp = input.target_gp ?? Number(existing.target_gp || 0);
  const costs = computeRecipeCosts(lines, yieldQty, sellingPrice, targetGp);

  const patch: Record<string, unknown> = {
    bom_name: input.recipe_name?.trim() ?? existing.recipe_name,
    category: input.category ?? existing.category,
    yield_qty: yieldQty,
    yield_unit: input.yield_unit ?? existing.yield_unit,
    target_gp: targetGp,
    selling_price: sellingPrice,
    total_cost: costs.totalCost,
    ingredient_cost: costs.ingredientCost,
    packaging_cost: costs.packagingCost,
    cost_per_unit: costs.costPerUnit,
    calculated_gp: costs.calculatedGp,
    suggested_selling_price: costs.suggestedSellingPrice,
    status: input.status ?? existing.status,
    notes: input.notes ?? existing.notes,
    // A BOM turned into a Sub-BOM releases its product link: it is no longer
    // sold on its own. The product and its stock item are left alone.
    product_id:
      purpose === "Sub-BOM"
        ? null
        : input.product_id !== undefined
          ? input.product_id
          : existing.product_id,
    bom_purpose: purpose,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .update(patch)
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  let savedLines = existing.lines || [];
  if (input.lines) {
    await supabase.from("vyron_cost_bom_lines").delete().eq("bom_id", recipeId).eq("company_id", companyId);
    savedLines = await insertRecipeLines(supabase, companyId, recipeId, lines);
  }

  const nextProductId =
    purpose === "Sub-BOM" ? null : input.product_id !== undefined ? input.product_id : existing.product_id;
  const linkedProducts = await syncLinkedProducts(
    supabase,
    companyId,
    recipeId,
    costs.totalCost,
    costs.costPerUnit,
    nextProductId,
    existing.product_id
  );

  return { recipe: mapBomRow(data as Record<string, unknown>, savedLines), linkedProducts };
}

export async function recalculateBomCosts(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string
): Promise<{ productCount: number }> {
  const recipe = await getRecipe(supabase, companyId, recipeId);
  if (!recipe) return { productCount: 0 };

  const lineInputs: RecipeLineInput[] = (recipe.lines || []).map((line) => ({
    line_type: line.line_type,
    ingredient_id: line.ingredient_id,
    line_name: line.line_name,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost: line.unit_cost,
    wastage_percent: line.wastage_percent,
    sort_order: line.sort_order,
  }));

  const costs = computeRecipeCosts(
    lineInputs,
    recipe.yield_qty,
    Number(recipe.selling_price || 0),
    Number(recipe.target_gp || 0)
  );

  const { error } = await supabase
    .from("vyron_cost_boms")
    .update({
      total_cost: costs.totalCost,
      ingredient_cost: costs.ingredientCost,
      packaging_cost: costs.packagingCost,
      cost_per_unit: costs.costPerUnit,
      calculated_gp: costs.calculatedGp,
      suggested_selling_price: costs.suggestedSellingPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const productCount = await syncLinkedProducts(
    supabase,
    companyId,
    recipeId,
    costs.totalCost,
    costs.costPerUnit,
    recipe.product_id
  );

  return { productCount };
}

/**
 * Deleting a BOM that another BOM is built from would leave the parent with a
 * line pointing at nothing, so it is refused and the parents are named. The
 * database says the same thing through ON DELETE RESTRICT; this check runs
 * first so the caller gets the parent names rather than a constraint code.
 */
export async function deleteRecipe(supabase: SupabaseClient, companyId: string, recipeId: string) {
  const parents = await findParentBoms(supabase, companyId, recipeId);
  if (parents.length) throw new BomInUseError(parents);

  await supabase
    .from("vyron_cost_products")
    .update({ linked_bom_id: null, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("linked_bom_id", recipeId);

  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .update({ status: "Archived", updated_at: new Date().toISOString() })
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapBomRow(data as Record<string, unknown>);
}

export async function listRecipeLines(supabase: SupabaseClient, companyId: string, recipeId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_bom_lines")
    .select("*")
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((line) => mapLineRow(line as Record<string, unknown>));
}

export async function createRecipeLine(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  input: RecipeLineInput
) {
  const recipe = await getRecipe(supabase, companyId, recipeId);
  if (!recipe) throw new Error("Recipe not found.");

  const [line] = await insertRecipeLines(supabase, companyId, recipeId, [input]);
  const lines = await listRecipeLines(supabase, companyId, recipeId);
  const costs = computeRecipeCosts(
    lines,
    recipe.yield_qty,
    Number(recipe.selling_price || 0),
    Number(recipe.target_gp || 0)
  );

  await supabase
    .from("vyron_cost_boms")
    .update({
      total_cost: costs.totalCost,
      ingredient_cost: costs.ingredientCost,
      packaging_cost: costs.packagingCost,
      cost_per_unit: costs.costPerUnit,
      calculated_gp: costs.calculatedGp,
      suggested_selling_price: costs.suggestedSellingPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("company_id", companyId);

  await syncLinkedProducts(supabase, companyId, recipeId, costs.totalCost, costs.costPerUnit, recipe.product_id);
  return line;
}

export async function updateRecipeLine(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  lineId: string,
  input: Partial<RecipeLineInput>
) {
  const recipe = await getRecipe(supabase, companyId, recipeId);
  if (!recipe) throw new Error("Recipe not found.");

  const patch: Record<string, unknown> = {};
  if (input.line_type !== undefined) patch.line_type = input.line_type;
  if (input.ingredient_id !== undefined) patch.ingredient_id = input.ingredient_id;
  if (input.component_id !== undefined) patch.component_id = input.component_id;
  if (input.line_name !== undefined) patch.line_name = input.line_name.trim();
  if (input.quantity !== undefined) patch.quantity = Number(input.quantity);
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.unit_cost !== undefined) patch.unit_cost = Number(input.unit_cost);
  if (input.wastage_percent !== undefined) patch.wastage_percent = Number(input.wastage_percent);
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  const { data: existing } = await supabase
    .from("vyron_cost_bom_lines")
    .select("*")
    .eq("id", lineId)
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!existing) throw new Error("Line not found.");

  const merged: RecipeLineInput = {
    line_type: String(patch.line_type ?? existing.line_type ?? "Ingredient"),
    ingredient_id: patch.ingredient_id !== undefined ? (patch.ingredient_id as string | null) : (existing.ingredient_id as string | null),
    line_name: String(patch.line_name ?? existing.line_name ?? ""),
    quantity: Number(patch.quantity ?? existing.quantity ?? 0),
    unit: String(patch.unit ?? existing.unit ?? "kg"),
    unit_cost: Number(patch.unit_cost ?? existing.unit_cost ?? 0),
    wastage_percent: Number(patch.wastage_percent ?? existing.wastage_percent ?? 0),
  };
  const { data, error } = await supabase
    .from("vyron_cost_bom_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("bom_id", recipeId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const lines = await listRecipeLines(supabase, companyId, recipeId);
  const costs = computeRecipeCosts(
    lines,
    recipe.yield_qty,
    Number(recipe.selling_price || 0),
    Number(recipe.target_gp || 0)
  );
  await supabase
    .from("vyron_cost_boms")
    .update({
      total_cost: costs.totalCost,
      ingredient_cost: costs.ingredientCost,
      packaging_cost: costs.packagingCost,
      cost_per_unit: costs.costPerUnit,
      calculated_gp: costs.calculatedGp,
      suggested_selling_price: costs.suggestedSellingPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("company_id", companyId);
  await syncLinkedProducts(supabase, companyId, recipeId, costs.totalCost, costs.costPerUnit, recipe.product_id);

  return mapLineRow(data as Record<string, unknown>);
}

export async function deleteRecipeLine(
  supabase: SupabaseClient,
  companyId: string,
  recipeId: string,
  lineId: string
) {
  const recipe = await getRecipe(supabase, companyId, recipeId);
  if (!recipe) throw new Error("Recipe not found.");

  const { error } = await supabase
    .from("vyron_cost_bom_lines")
    .delete()
    .eq("id", lineId)
    .eq("bom_id", recipeId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const lines = await listRecipeLines(supabase, companyId, recipeId);
  const costs = computeRecipeCosts(
    lines,
    recipe.yield_qty,
    Number(recipe.selling_price || 0),
    Number(recipe.target_gp || 0)
  );
  await supabase
    .from("vyron_cost_boms")
    .update({
      total_cost: costs.totalCost,
      ingredient_cost: costs.ingredientCost,
      packaging_cost: costs.packagingCost,
      cost_per_unit: costs.costPerUnit,
      calculated_gp: costs.calculatedGp,
      suggested_selling_price: costs.suggestedSellingPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId)
    .eq("company_id", companyId);
  await syncLinkedProducts(supabase, companyId, recipeId, costs.totalCost, costs.costPerUnit, recipe.product_id);
  return { ok: true };
}

/** Map recipe record to BomHeader shape for existing UI components */
export function recipeToBomHeader(recipe: RecipeRecord) {
  return {
    id: recipe.id,
    bom_name: recipe.recipe_name,
    category: recipe.category,
    yield_qty: recipe.yield_qty,
    yield_unit: recipe.yield_unit,
    target_gp: recipe.target_gp,
    selling_price: recipe.selling_price,
    total_cost: recipe.total_cost,
    ingredient_cost: recipe.ingredient_cost,
    packaging_cost: recipe.packaging_cost,
    cost_per_unit: recipe.cost_per_unit,
    calculated_gp: recipe.calculated_gp,
    suggested_selling_price: recipe.suggested_selling_price,
    status: recipe.status,
    notes: recipe.notes,
    product_id: recipe.product_id,
    bom_purpose: recipe.bom_purpose,
    has_image: Boolean(recipe.image_path),
  };
}

export function recipeLineToBomLine(line: RecipeLineRecord) {
  return {
    id: line.id,
    bom_id: line.recipe_id,
    line_type: line.line_type,
    ingredient_id: line.ingredient_id,
    component_id: line.component_id,
    line_name: line.line_name,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost: line.unit_cost,
    wastage_percent: line.wastage_percent,
    line_cost: line.line_cost,
    sort_order: line.sort_order,
    child_bom_id: line.child_bom_id,
    child_bom_name: line.child_bom_name ?? null,
  };
}
