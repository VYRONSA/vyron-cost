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
};

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
  cost_per_unit: number;
  calculated_gp: number | null;
  suggested_selling_price: number | null;
  status: string | null;
  notes: string | null;
  product_id: string | null;
  lines?: RecipeLineRecord[];
};

export type RecipeLineRecord = {
  id: string;
  recipe_id: string;
  company_id: string | null;
  line_type: string;
  ingredient_id: string | null;
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

function lineCostInput(line: RecipeLineInput) {
  return {
    quantity: Number(line.quantity || 0),
    unit_cost: Number(line.unit_cost || 0),
    wastage_percent: Number(line.wastage_percent ?? 0),
  };
}

export function computeRecipeCosts(
  lines: RecipeLineInput[],
  yieldQty: number,
  sellingPrice: number,
  targetGp: number
) {
  const totalCost = round2(
    lines.reduce(
      (sum, line) =>
        sum +
        calcLineCost(lineCostInput(line)),
      0
    )
  );
  const numericYield = Math.max(1, Number(yieldQty || 1));
  const costPerUnit = round4(totalCost / numericYield);
  const calculatedGp = round2(calcGp(sellingPrice, costPerUnit));
  const suggestedSellingPrice = round2(calcSuggestedPrice(costPerUnit, targetGp));
  return { totalCost, costPerUnit, calculatedGp, suggestedSellingPrice };
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

export async function listRecipes(supabase: SupabaseClient, companyId: string, includeArchived = false) {
  let query = supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("company_id", companyId)
    .order("bom_name");
  if (!includeArchived) {
    query = query.neq("status", "Archived");
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapBomRow(row as Record<string, unknown>));
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

  return mapBomRow(
    bom as Record<string, unknown>,
    (lines || []).map((line) => mapLineRow(line as Record<string, unknown>))
  );
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
    await supabase
      .from("vyron_cost_products")
      .update({ linked_bom_id: null, updated_at: new Date().toISOString() })
      .eq("id", previousProductId)
      .eq("company_id", companyId)
      .eq("linked_bom_id", recipeId);
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
    await supabase
      .from("vyron_cost_products")
      .update({
        linked_bom_id: recipeId,
        total_cost: costPerUnit,
        cost_per_unit: costPerUnit,
        calculated_gp: calcGp(selling, costPerUnit),
        actual_gp: calcGp(selling, costPerUnit),
        suggested_selling_price: calcSuggestedPrice(costPerUnit, target),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId);
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
      line_name: line.line_name.trim(),
      quantity: Number(line.quantity || 0),
      unit: line.unit || "kg",
      unit_cost: Number(line.unit_cost || 0),
      wastage_percent: Number(line.wastage_percent || 0),
      line_cost: round2(calcLineCost(lineCostInput(line))),
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
  patch.line_cost = round2(calcLineCost(lineCostInput(merged)));

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
    line_name: line.line_name,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost: line.unit_cost,
    wastage_percent: line.wastage_percent,
    line_cost: line.line_cost,
    sort_order: line.sort_order,
  };
}
