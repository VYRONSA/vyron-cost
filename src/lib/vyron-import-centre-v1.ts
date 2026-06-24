import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignSupplierRole, upsertVyronContact } from "@/lib/vyron-contact-master";
import { calculateTrueUnitCost } from "@/lib/vyron-cost-core-data";
import { createRecipe, type RecipeLineInput } from "@/lib/vyron-cost-recipes-data";
import { parseCsvText, type ImportTemplate, type ParsedImportResult } from "@/lib/vyron-import-centre";

export type ImportCentreModule = "raw-materials" | "finished-goods" | "boms";

export type ImportCentreTemplate = {
  id: ImportCentreModule;
  label: string;
  description: string;
  columns: string[];
  sampleRow: string[];
};

export const importCentreTemplates: ImportCentreTemplate[] = [
  // BACKLOG: Opening Stock Import (Item, Warehouse, Qty, Value) — not yet implemented.
  {
    id: "raw-materials",
    label: "Raw Materials",
    description: "Ingredient master with supplier linkage via Contact Centre",
    columns: [
      "ingredient_name",
      "category",
      "supplier_name",
      "purchase_unit",
      "recipe_unit",
      "purchase_cost",
      "yield_percent",
    ],
    sampleRow: ["Chicken Fillet", "Protein", "Protein Direct", "kg", "kg", "95.00", "92"],
  },
  {
    id: "finished-goods",
    label: "Finished Goods",
    description: "Finished product master with selling price and target GP",
    columns: ["product_name", "category", "selling_price", "total_cost", "target_gp", "status"],
    sampleRow: ["Chicken Pie", "Pies", "32.00", "16.20", "40", "Active"],
  },
  {
    id: "boms",
    label: "BOMs / Recipes",
    description: "Recipe headers and ingredient lines in a flat import file",
    columns: [
      "bom_name",
      "finished_product_name",
      "category",
      "yield_qty",
      "target_gp",
      "line_type",
      "ingredient_name",
      "quantity",
      "unit",
      "unit_cost",
      "wastage_percent",
    ],
    sampleRow: [
      "Chicken Pie BOM",
      "Chicken Pie",
      "Pies",
      "1",
      "40",
      "Ingredient",
      "Chicken Fillet",
      "0.12",
      "kg",
      "95.00",
      "2",
    ],
  },
];

export type ImportCentreStats = {
  rawMaterials: number;
  finishedGoods: number;
  boms: number;
};

export type ImportCentreValidateResult = ParsedImportResult & {
  preview: Record<string, string>[];
  missingIngredients?: string[];
  missingFinishedGoods?: string[];
};

export type ImportCentreImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  createdCategories: number;
  createdSuppliers: number;
  createdMaterials: number;
};

export function getImportCentreTemplate(module: ImportCentreModule): ImportCentreTemplate {
  const template = importCentreTemplates.find((item) => item.id === module);
  if (!template) throw new Error("Unknown import module.");
  return template;
}

export function importCentreTemplateCsv(module: ImportCentreModule) {
  const template = getImportCentreTemplate(module);
  return `${template.columns.join(",")}\n${template.sampleRow.join(",")}\n`;
}

export function parseImportCentreCsv(module: ImportCentreModule, text: string): ParsedImportResult {
  return parseCsvText(text, getImportCentreTemplate(module) as unknown as ImportTemplate);
}

export async function getImportCentreStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<ImportCentreStats> {
  const [ingredients, products, boms] = await Promise.all([
    supabase
      .from("vyron_cost_ingredients")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_boms")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .neq("status", "Archived"),
  ]);

  if (ingredients.error) throw new Error(ingredients.error.message);
  if (products.error) throw new Error(products.error.message);
  if (boms.error) throw new Error(boms.error.message);

  return {
    rawMaterials: ingredients.count || 0,
    finishedGoods: products.count || 0,
    boms: boms.count || 0,
  };
}

async function ensureCategory(
  supabase: SupabaseClient,
  companyId: string,
  categoryName: string,
  categoryType: "Ingredient" | "Product" | "Recipe"
) {
  const name = categoryName.trim();
  if (!name) return false;

  const { data: existing, error: existingError } = await supabase
    .from("vyron_cost_categories")
    .select("id")
    .eq("company_id", companyId)
    .eq("category_name", name)
    .eq("category_type", categoryType)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return false;

  const { error } = await supabase.from("vyron_cost_categories").insert({
    company_id: companyId,
    category_name: name,
    category_type: categoryType,
    status: "Active",
    description: null,
  });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
}

async function resolveSupplierIdViaContactMaster(
  supabase: SupabaseClient,
  companyId: string,
  supplierName: string
): Promise<{ supplierId: string | null; created: boolean }> {
  const name = supplierName.trim();
  if (!name) return { supplierId: null, created: false };

  const { data: existingSupplier, error: supplierError } = await supabase
    .from("vyron_cost_suppliers")
    .select("id")
    .eq("company_id", companyId)
    .ilike("supplier_name", name)
    .maybeSingle();

  if (supplierError) throw new Error(supplierError.message);
  if (existingSupplier?.id) return { supplierId: String(existingSupplier.id), created: false };

  await upsertVyronContact(supabase, companyId, {
    contact_name: name,
    is_supplier: true,
  });

  const { data: contactRow, error: contactRowError } = await supabase
    .from("vyron_contacts")
    .select("id")
    .eq("company_id", companyId)
    .ilike("contact_name", name)
    .maybeSingle();

  if (contactRowError) throw new Error(contactRowError.message);
  const contactId = contactRow?.id ? String(contactRow.id) : null;
  if (!contactId) return { supplierId: null, created: false };

  await assignSupplierRole(supabase, companyId, contactId);

  const { data: supplierAfterAssign, error: afterAssignError } = await supabase
    .from("vyron_cost_suppliers")
    .select("id")
    .eq("company_id", companyId)
    .ilike("supplier_name", name)
    .maybeSingle();

  if (afterAssignError) throw new Error(afterAssignError.message);
  return {
    supplierId: supplierAfterAssign?.id ? String(supplierAfterAssign.id) : null,
    created: Boolean(supplierAfterAssign?.id),
  };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

async function loadIngredientNameSet(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("ingredient_name")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((row) => normalizeName(String(row.ingredient_name || ""))));
}

async function loadProductNameMap(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of data || []) {
    const key = normalizeName(String(row.product_name || ""));
    if (key) map.set(key, String(row.id));
  }
  return map;
}

async function loadIngredientNameMap(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name, purchase_unit, recipe_unit, purchase_cost")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  const map = new Map<string, (typeof data)[number]>();
  for (const row of data || []) {
    const key = normalizeName(String(row.ingredient_name || ""));
    if (key) map.set(key, row);
  }
  return map;
}

export async function validateImportCentreRows(
  supabase: SupabaseClient,
  companyId: string,
  module: ImportCentreModule,
  rows: Record<string, string>[]
): Promise<ImportCentreValidateResult> {
  const template = getImportCentreTemplate(module);
  const validRows: Record<string, string>[] = [];
  const invalidRows: ImportCentreValidateResult["invalidRows"] = [];

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const primary = row[template.columns[0]]?.trim();
    if (!primary) errors.push(`${template.columns[0]} is required`);

    for (const col of template.columns) {
      if (/price|cost|qty|percent|movement|gp/i.test(col) && row[col] && Number.isNaN(Number(row[col]))) {
        errors.push(`${col} must be numeric`);
      }
    }

    if (module === "boms") {
      if (!row.ingredient_name?.trim()) errors.push("ingredient_name is required");
      if (!row.bom_name?.trim()) errors.push("bom_name is required");
      if (!row.finished_product_name?.trim()) errors.push("finished_product_name is required");
      if (!row.quantity?.trim() || Number(row.quantity) <= 0) {
        errors.push("quantity must be greater than zero");
      }
    }

    if (errors.length) invalidRows.push({ rowNumber: index + 2, row, errors });
    else validRows.push(row);
  });

  const preview = validRows.slice(0, 25);

  if (module !== "boms") {
    return { validRows, invalidRows, preview };
  }

  const ingredientNames = new Set<string>();
  const finishedGoodNames = new Set<string>();
  for (const row of validRows) {
    const ingredient = row.ingredient_name?.trim();
    const finished = row.finished_product_name?.trim();
    if (ingredient) ingredientNames.add(ingredient);
    if (finished) finishedGoodNames.add(finished);
  }

  const [ingredientSet, productMap] = await Promise.all([
    loadIngredientNameSet(supabase, companyId),
    loadProductNameMap(supabase, companyId),
  ]);

  const missingIngredients = [...ingredientNames].filter(
    (name) => !ingredientSet.has(normalizeName(name))
  );
  const missingFinishedGoods = [...finishedGoodNames].filter(
    (name) => !productMap.has(normalizeName(name))
  );

  return {
    validRows,
    invalidRows,
    preview,
    missingIngredients,
    missingFinishedGoods,
  };
}

export async function importRawMaterials(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportCentreImportResult> {
  let imported = 0;
  let skipped = 0;
  let createdCategories = 0;
  let createdSuppliers = 0;
  const errors: string[] = [];

  const { data: existingRows, error: existingError } = await supabase
    .from("vyron_cost_ingredients")
    .select("ingredient_name")
    .eq("company_id", companyId);

  if (existingError) throw new Error(existingError.message);
  const existingNames = new Set(
    (existingRows || []).map((row) => normalizeName(String(row.ingredient_name || "")))
  );

  for (const row of rows) {
    const name = row.ingredient_name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    if (existingNames.has(normalizeName(name))) {
      skipped += 1;
      continue;
    }

    try {
      if (row.category?.trim()) {
        const created = await ensureCategory(supabase, companyId, row.category, "Ingredient");
        if (created) createdCategories += 1;
      }

      let supplierId: string | null = null;
      if (row.supplier_name?.trim()) {
        const supplierResult = await resolveSupplierIdViaContactMaster(
          supabase,
          companyId,
          row.supplier_name
        );
        supplierId = supplierResult.supplierId;
        if (supplierResult.created) createdSuppliers += 1;
      }

      const purchaseCost = Number(row.purchase_cost || 0);
      const yieldPercent = Number(row.yield_percent || 100);

      const { error } = await supabase.from("vyron_cost_ingredients").insert({
        id: randomUUID(),
        company_id: companyId,
        ingredient_name: name,
        category: row.category?.trim() || "Uncategorised",
        supplier_id: supplierId,
        purchase_unit: row.purchase_unit?.trim() || "kg",
        recipe_unit: row.recipe_unit?.trim() || row.purchase_unit?.trim() || "kg",
        purchase_cost: purchaseCost,
        yield_percent: yieldPercent,
        true_unit_cost: calculateTrueUnitCost(purchaseCost, yieldPercent),
      });

      if (error) {
        errors.push(`${name}: ${error.message}`);
        skipped += 1;
        continue;
      }

      existingNames.add(normalizeName(name));
      imported += 1;
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : "Import failed"}`);
      skipped += 1;
    }
  }

  return { imported, skipped, errors, createdCategories, createdSuppliers, createdMaterials: 0 };
}

export async function importFinishedGoods(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[]
): Promise<ImportCentreImportResult> {
  let imported = 0;
  let skipped = 0;
  let createdCategories = 0;
  const errors: string[] = [];

  const { data: existingRows, error: existingError } = await supabase
    .from("vyron_cost_products")
    .select("product_name")
    .eq("company_id", companyId);

  if (existingError) throw new Error(existingError.message);
  const existingNames = new Set(
    (existingRows || []).map((row) => normalizeName(String(row.product_name || "")))
  );

  for (const row of rows) {
    const name = row.product_name?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    if (existingNames.has(normalizeName(name))) {
      skipped += 1;
      continue;
    }

    try {
      if (row.category?.trim()) {
        const created = await ensureCategory(supabase, companyId, row.category, "Product");
        if (created) createdCategories += 1;
      }

      const selling = Number(row.selling_price || 0);
      const cost = Number(row.total_cost || 0);
      const targetGp = Number(row.target_gp || 0);
      const actualGp = selling > 0 ? ((selling - cost) / selling) * 100 : 0;

      const { error } = await supabase.from("vyron_cost_products").insert({
        id: randomUUID(),
        company_id: companyId,
        product_name: name,
        category: row.category?.trim() || "General",
        product_category: row.category?.trim() || "General",
        selling_price: selling,
        total_cost: cost,
        target_gp: targetGp,
        calculated_gp: actualGp,
        actual_gp: actualGp,
        status: row.status?.trim() || "Active",
        product_status: row.status?.trim() || "Active",
      });

      if (error) {
        errors.push(`${name}: ${error.message}`);
        skipped += 1;
        continue;
      }

      existingNames.add(normalizeName(name));
      imported += 1;
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : "Import failed"}`);
      skipped += 1;
    }
  }

  return {
    imported,
    skipped,
    errors,
    createdCategories,
    createdSuppliers: 0,
    createdMaterials: 0,
  };
}

async function createMissingIngredient(
  supabase: SupabaseClient,
  companyId: string,
  ingredientName: string,
  unitCost: number,
  unit: string
) {
  const name = ingredientName.trim();
  const { data: existing } = await supabase
    .from("vyron_cost_ingredients")
    .select("id")
    .eq("company_id", companyId)
    .ilike("ingredient_name", name)
    .maybeSingle();

  if (existing?.id) return;

  const purchaseCost = Number(unitCost || 0);
  const { error } = await supabase.from("vyron_cost_ingredients").insert({
    id: randomUUID(),
    company_id: companyId,
    ingredient_name: name,
    category: "Imported",
    purchase_unit: unit || "kg",
    recipe_unit: unit || "kg",
    purchase_cost: purchaseCost,
    yield_percent: 100,
    true_unit_cost: calculateTrueUnitCost(purchaseCost, 100),
  });
  if (error) throw new Error(error.message);
}

export async function importBoms(
  supabase: SupabaseClient,
  companyId: string,
  rows: Record<string, string>[],
  options: { createMissingMaterials?: boolean } = {}
): Promise<ImportCentreImportResult> {
  let imported = 0;
  let skipped = 0;
  let createdCategories = 0;
  let createdMaterials = 0;
  const errors: string[] = [];

  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const bomName = row.bom_name?.trim();
    if (!bomName) continue;
    const bucket = grouped.get(bomName) || [];
    bucket.push(row);
    grouped.set(bomName, bucket);
  }

  const [productMap, initialIngredientMap, existingBoms] = await Promise.all([
    loadProductNameMap(supabase, companyId),
    loadIngredientNameMap(supabase, companyId),
    supabase.from("vyron_cost_boms").select("bom_name").eq("company_id", companyId),
  ]);

  let ingredientMap = initialIngredientMap;

  if (existingBoms.error) throw new Error(existingBoms.error.message);
  const existingBomNames = new Set(
    (existingBoms.data || []).map((row) => normalizeName(String(row.bom_name || "")))
  );

  for (const [bomName, bomRows] of grouped.entries()) {
    if (existingBomNames.has(normalizeName(bomName))) {
      skipped += bomRows.length;
      continue;
    }

    try {
      const header = bomRows[0];
      const finishedName = header.finished_product_name?.trim() || "";
      const productId = finishedName ? productMap.get(normalizeName(finishedName)) || null : null;

      if (finishedName && !productId) {
        errors.push(`${bomName}: finished product "${finishedName}" not found`);
        skipped += bomRows.length;
        continue;
      }

      if (header.category?.trim()) {
        const created = await ensureCategory(supabase, companyId, header.category, "Recipe");
        if (created) createdCategories += 1;
      }

      const lines: RecipeLineInput[] = [];
      for (const row of bomRows) {
        const ingredientName = row.ingredient_name?.trim();
        if (!ingredientName) continue;

        let ingredient = ingredientMap.get(normalizeName(ingredientName));
        if (!ingredient && options.createMissingMaterials) {
          await createMissingIngredient(
            supabase,
            companyId,
            ingredientName,
            Number(row.unit_cost || 0),
            row.unit?.trim() || "kg"
          );
          createdMaterials += 1;
          ingredientMap = await loadIngredientNameMap(supabase, companyId);
          ingredient = ingredientMap.get(normalizeName(ingredientName));
        }

        if (!ingredient) {
          errors.push(`${bomName}: ingredient "${ingredientName}" not found`);
          continue;
        }

        lines.push({
          line_type: row.line_type?.trim() || "Ingredient",
          ingredient_id: String(ingredient.id),
          line_name: ingredientName,
          quantity: Number(row.quantity || 0),
          unit: row.unit?.trim() || String(ingredient.recipe_unit || ingredient.purchase_unit || "kg"),
          unit_cost: Number(row.unit_cost || ingredient.purchase_cost || 0),
          wastage_percent: Number(row.wastage_percent || 0),
          sort_order: lines.length,
        });
      }

      if (!lines.length) {
        errors.push(`${bomName}: no valid BOM lines`);
        skipped += bomRows.length;
        continue;
      }

      await createRecipe(supabase, companyId, {
        recipe_name: bomName,
        category: header.category?.trim() || "General",
        yield_qty: Number(header.yield_qty || 1),
        yield_unit: "unit",
        target_gp: Number(header.target_gp || 0),
        status: "Draft",
        product_id: productId,
        lines,
      });

      existingBomNames.add(normalizeName(bomName));
      imported += 1;
    } catch (error) {
      errors.push(`${bomName}: ${error instanceof Error ? error.message : "Import failed"}`);
      skipped += bomRows.length;
    }
  }

  return {
    imported,
    skipped,
    errors,
    createdCategories,
    createdSuppliers: 0,
    createdMaterials,
  };
}

export async function importImportCentreRows(
  supabase: SupabaseClient,
  companyId: string,
  module: ImportCentreModule,
  rows: Record<string, string>[],
  options: { createMissingMaterials?: boolean } = {}
): Promise<ImportCentreImportResult> {
  if (module === "raw-materials") return importRawMaterials(supabase, companyId, rows);
  if (module === "finished-goods") return importFinishedGoods(supabase, companyId, rows);
  return importBoms(supabase, companyId, rows, options);
}
