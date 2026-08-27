import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcGp, calcLineCost, calcSuggestedPrice } from "@/lib/vyron-cost-bom-data";

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
      ingredient_id: line.ingredient_id || null,
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
    lines?: RecipeLineInput[];
  }
) {
  const lines = input.lines || [];
  const costs = computeRecipeCosts(
    lines,
    Number(input.yield_qty || 1),
    Number(input.selling_price || 0),
    Number(input.target_gp || 0)
  );

  const recipeId = randomUUID();
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
      product_id: input.product_id || null,
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
    input.product_id
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
    lines?: RecipeLineInput[];
  }
) {
  const existing = await getRecipe(supabase, companyId, recipeId);
  if (!existing) throw new Error("Recipe not found.");

  const lines =
    input.lines ??
    (existing.lines || []).map((line) => ({
      line_type: line.line_type,
      ingredient_id: line.ingredient_id,
      component_id: line.component_id,
      line_name: line.line_name,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unit_cost,
      wastage_percent: line.wastage_percent,
      sort_order: line.sort_order,
    }));

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
    product_id: input.product_id !== undefined ? input.product_id : existing.product_id,
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

  const nextProductId = input.product_id !== undefined ? input.product_id : existing.product_id;
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

export async function deleteRecipe(supabase: SupabaseClient, companyId: string, recipeId: string) {
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
  };
}
