import { supabase } from "@/lib/supabase";
import {
  getHandcraftedBatchRuns,
  getHandcraftedCategories,
  getHandcraftedRecipeItems,
  getHandcraftedRecipes,
} from "@/lib/handcrafted-tenant";
import { loadHandcraftedBundle } from "@/lib/vyron-handcrafted-intelligence";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type Ingredient = {
  id: string;
  company_id?: string;
  supplier_id?: string | null;
  ingredient_name: string;
  category: string;
  purchase_unit: string;
  recipe_unit: string;
  purchase_cost: number;
  previous_cost: number;
  yield_type: string;
  yield_percent: number;
  true_unit_cost: number;
  current_alert: string | null;
};

export type Supplier = {
  id: string;
  company_id?: string;
  supplier_name: string;
  category: string;
  contact_email: string | null;
  invoice_email: string | null;
  risk_status: string;
  last_price_movement: number;
};

export type Product = {
  id: string;
  company_id?: string;
  product_name: string;
  category: string;
  status?: string;
  selling_price: number;
  total_cost: number;
  target_gp: number;
  salary_cost?: number;
  packaging_cost?: number;
  overhead_cost?: number;
  wastage_percent?: number;
  extracted_line_count?: number;
};

export type ProductCostLine = {
  id: string;
  company_id?: string;
  product_id?: string | null;
  product_name?: string | null;
  line_type: string;
  line_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  line_cost: number;
  line_cost_imported?: number;
  source_sheet?: string | null;
  source_row?: number | null;
  raw_row?: string | null;
};

export type Recipe = {
  id: string;
  company_id?: string;
  recipe_name: string;
  recipe_type: string;
  category?: string;
  yield_qty: number;
  total_cost: number;
  status: string;
  target_gp?: number;
  selling_price?: number;
  version_note?: string | null;
};

export type RecipeItem = {
  id: string;
  company_id?: string;
  recipe_id?: string;
  ingredient_id?: string | null;
  ingredient_name_snapshot: string;
  quantity: number;
  unit: string;
  true_unit_cost: number;
  line_cost: number;
};

export type ProductRecipeLink = {
  id: string;
  company_id?: string;
  product_id?: string;
  recipe_id?: string;
  recipe_name_snapshot: string;
  portion_qty: number;
  portion_cost: number;
};

export type BatchRun = {
  id: string;
  company_id?: string;
  recipe_id?: string | null;
  batch_number: string;
  recipe_name_snapshot: string;
  planned_yield: number;
  actual_yield: number;
  planned_cost: number;
  actual_cost: number;
  variance: number;
  status: string;
};

export type Category = {
  id: string;
  company_id?: string;
  category_name: string;
  category_type: string;
  description: string | null;
  status: string;
};

export type InvoiceQueueItem = {
  id: string;
  company_id?: string;
  supplier_id?: string | null;
  invoice_number: string | null;
  status: string;
  extracted_lines: number;
  confidence: number;
  estimated_impact: number;
  supplier_name_snapshot?: string | null;
};

export type InvoiceExtractedLine = {
  id: string;
  company_id?: string;
  invoice_id?: string;
  raw_description: string;
  suggested_match: string | null;
  quantity: number;
  unit: string;
  line_total: number;
  extracted_unit_price: number;
  confidence: number;
  status: string;
};

export type VyronUser = {
  id: string;
  company_id?: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
};

export type AuditEvent = {
  id: string;
  company_id?: string;
  event_type: string;
  entity_name: string;
  event_detail: string;
  risk_level: string;
  created_at?: string;
};

export type PurchaseOrder = {
  id: string;
  company_id?: string;
  supplier_id?: string | null;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  expected_total: number;
  invoice_total: number;
  variance: number;
};

export type VyronReport = {
  id: string;
  company_id?: string;
  report_name: string;
  report_type: string;
  status: string;
  estimated_value: number;
};

export const demoCompanyId = "demo-company";

export function calculateTrueUnitCost(purchaseCost: number, yieldPercent: number) {
  if (!yieldPercent || yieldPercent <= 0) return purchaseCost;
  return purchaseCost / (yieldPercent / 100);
}

export function calculateGpPercent(sellingPrice: number, totalCost: number) {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return ((sellingPrice - totalCost) / sellingPrice) * 100;
}

export function calculateSuggestedPrice(totalCost: number, targetGp: number) {
  if (!targetGp || targetGp >= 100) return totalCost;
  return totalCost / (1 - targetGp / 100);
}

export function calculateMovementPercent(oldPrice: number, newPrice: number) {
  if (!oldPrice || oldPrice <= 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export function calculateYieldVariance(plannedYield: number, actualYield: number) {
  if (!plannedYield || plannedYield <= 0) return 0;
  return ((actualYield - plannedYield) / plannedYield) * 100;
}

export function calculateLineCost(quantity: number, unitCost: number, wastagePercent: number) {
  return Number(quantity || 0) * Number(unitCost || 0) * (1 + Number(wastagePercent || 0) / 100);
}

export function isCostLineForProduct(line: ProductCostLine, product: Product) {
  return (
    line.product_id === product.id ||
    String(line.product_name || "").trim().toLowerCase() ===
      String(product.product_name || "").trim().toLowerCase()
  );
}

export function sumProductCostLineTotal(lines: ProductCostLine[], product: Product) {
  return lines
    .filter((line) => isCostLineForProduct(line, product))
    .reduce((sum, line) => sum + Number(line.line_cost || line.line_cost_imported || 0), 0);
}

export function buildProductCostFields(
  sellingPrice: number,
  targetGp: number,
  totalCost: number
) {
  return {
    total_cost: totalCost,
    calculated_gp: calculateGpPercent(sellingPrice, totalCost),
    actual_gp: calculateGpPercent(sellingPrice, totalCost),
    suggested_selling_price: calculateSuggestedPrice(totalCost, targetGp),
  };
}

export function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function statusTone(status: string): "emerald" | "amber" | "red" | "slate" {
  const value = String(status || "").toLowerCase();
  if (value.includes("critical") || value.includes("high") || value.includes("risk") || value.includes("variance") || value.includes("increase") || value.includes("rejected")) return "red";
  if (value.includes("watch") || value.includes("review") || value.includes("pending") || value.includes("version") || value.includes("medium")) return "amber";
  if (value.includes("stable") || value.includes("approved") || value.includes("healthy") || value.includes("ready") || value.includes("matched") || value.includes("low") || value.includes("complete") || value.includes("active")) return "emerald";
  return "slate";
}

export const demoIngredients: Ingredient[] = [
  { id: "demo-rice", company_id: demoCompanyId, ingredient_name: "Rice", category: "Dry Goods", purchase_unit: "kg raw", recipe_unit: "kg cooked", purchase_cost: 30, previous_cost: 28.5, yield_type: "weight_gain", yield_percent: 250, true_unit_cost: 12, current_alert: "Rice gains weight after cooking." },
  { id: "demo-avo", company_id: demoCompanyId, ingredient_name: "Avocado", category: "Fresh Produce", purchase_unit: "kg whole", recipe_unit: "kg usable flesh", purchase_cost: 40, previous_cost: 36.5, yield_type: "weight_loss", yield_percent: 65, true_unit_cost: 61.54, current_alert: "Avocado loses weight after skin and pit removal." },
];

export const demoSuppliers: Supplier[] = [
  { id: "supplier-1", company_id: demoCompanyId, supplier_name: "Demo Fresh Supplier", category: "Fresh Produce", contact_email: "orders@demofresh.co.za", invoice_email: "demo@invoices.vyroncost.com", risk_status: "High Risk", last_price_movement: 12.4 },
  { id: "supplier-2", company_id: demoCompanyId, supplier_name: "Packaging World", category: "Packaging", contact_email: "billing@packworld.co.za", invoice_email: "demo@invoices.vyroncost.com", risk_status: "Watch", last_price_movement: 5.4 },
];

export const demoProducts: Product[] = [
  { id: "product-1", company_id: demoCompanyId, product_name: "Salmon Poke Bowl", category: "Bowls", status: "Imported", selling_price: 89.9, total_cost: 64.2, target_gp: 39, salary_cost: 5.5, packaging_cost: 3.2, overhead_cost: 2.8, wastage_percent: 3, extracted_line_count: 6 },
  { id: "product-2", company_id: demoCompanyId, product_name: "California Roll", category: "Sushi", status: "Imported", selling_price: 59.9, total_cost: 41.33, target_gp: 38, salary_cost: 4.2, packaging_cost: 2.9, overhead_cost: 1.5, wastage_percent: 2, extracted_line_count: 4 },
];

export const demoProductCostLines: ProductCostLine[] = [
  { id: "pcl-1", company_id: demoCompanyId, product_id: "product-1", product_name: "Salmon Poke Bowl", line_type: "Ingredient", line_name: "Sushi Rice", quantity: 0.18, unit: "kg cooked", unit_cost: 12, wastage_percent: 2, line_cost: 2.2 },
  { id: "pcl-2", company_id: demoCompanyId, product_id: "product-1", product_name: "Salmon Poke Bowl", line_type: "Packaging", line_name: "Takeaway Bowl", quantity: 1, unit: "unit", unit_cost: 3.2, wastage_percent: 0, line_cost: 3.2 },
];

export const demoRecipes: Recipe[] = [
  { id: "recipe-1", company_id: demoCompanyId, recipe_name: "California Roll Base", recipe_type: "Sub Recipe", category: "Sushi", yield_qty: 1, total_cost: 18.42, status: "Approved", selling_price: 59.9, target_gp: 38, version_note: "Base recipe approved." },
];

export const demoCategories: Category[] = [
  { id: "cat-1", company_id: demoCompanyId, category_name: "Fresh Produce", category_type: "Ingredient", description: "Fresh fruit and produce", status: "Active" },
  { id: "cat-2", company_id: demoCompanyId, category_name: "Packaging", category_type: "Costing", description: "Packaging materials", status: "Active" },
  { id: "cat-3", company_id: demoCompanyId, category_name: "Sushi", category_type: "Product", description: "Sushi range", status: "Active" },
  { id: "cat-4", company_id: demoCompanyId, category_name: "Bowls", category_type: "Product", description: "Bowl range", status: "Active" },
];

export const demoRecipeItems: RecipeItem[] = [
  { id: "ri-1", company_id: demoCompanyId, recipe_id: "recipe-1", ingredient_id: "demo-rice", ingredient_name_snapshot: "Rice", quantity: 0.12, unit: "kg cooked", true_unit_cost: 12, line_cost: 1.44 },
];

export const demoProductRecipeLinks: ProductRecipeLink[] = [];
export const demoBatchRuns: BatchRun[] = [];
export const demoInvoiceQueue: InvoiceQueueItem[] = [];
export const demoInvoiceLines: InvoiceExtractedLine[] = [];
export const demoUsers: VyronUser[] = [];
export const demoAudit: AuditEvent[] = [];
export const demoPurchaseOrders: PurchaseOrder[] = [];
export const demoReports: VyronReport[] = [];

async function fetchRows<T>(
  table: string,
  fallback: T[],
  orderColumn: string,
  limit = 250
): Promise<T[]> {
  const { useDemo, companyId } = await workspaceScope();

  if (!useDemo && !companyId) return [];
  if (!supabase) return useDemo ? fallback : [];

  if (!companyId) return useDemo ? fallback : [];

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .order(orderColumn, { ascending: true })
    .limit(limit);

  if (error || !data || data.length === 0) return useDemo ? fallback : [];
  return data as T[];
}

async function getHandcraftedBundleSlice() {
  if (!(await workspaceScope()).useDemo) return null;
  return loadHandcraftedBundle();
}

export async function getDemoCompanyId() {
  const { companyId } = await workspaceScope();
  if (companyId) return companyId;
  if (!supabase) return demoCompanyId;
  const { data, error } = await supabase.from("vyron_cost_companies").select("id").eq("name", "Demo Company").maybeSingle();
  if (error || !data?.id) return demoCompanyId;
  return data.id as string;
}

export async function getIngredients(limit = 250) {
  const bundle = await getHandcraftedBundleSlice();
  if (bundle?.ingredients.length) return bundle.ingredients.slice(0, limit);
  return fetchRows<Ingredient>("vyron_cost_ingredients", demoIngredients, "ingredient_name", limit);
}

export async function getSuppliers(limit = 250) {
  const bundle = await getHandcraftedBundleSlice();
  if (bundle?.suppliers.length) return bundle.suppliers.slice(0, limit);
  return fetchRows<Supplier>("vyron_cost_suppliers", demoSuppliers, "supplier_name", limit);
}

export async function getProducts(limit = 250) {
  const bundle = await getHandcraftedBundleSlice();
  if (bundle?.products.length) return bundle.products.slice(0, limit);
  return fetchRows<Product>("vyron_cost_products", demoProducts, "product_name", limit);
}

export async function getProductById(id: string): Promise<Product | null> {
  const { useDemo, companyId } = await workspaceScope();
  if (!useDemo && !companyId) return null;

  const bundle = await getHandcraftedBundleSlice();
  if (bundle?.products.length) {
    return bundle.products.find((item) => item.id === id) || null;
  }

  if (!supabase) {
    return useDemo ? demoProducts.find((item) => item.id === id) || null : null;
  }

  if (!companyId) {
    return useDemo ? demoProducts.find((item) => item.id === id) || null : null;
  }

  const { data, error } = await supabase
    .from("vyron_cost_products")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    return useDemo ? demoProducts.find((item) => item.id === id) || null : null;
  }

  return data as Product;
}

export async function getProductCostLines(limit = 1000) {
  const bundle = await getHandcraftedBundleSlice();
  if (bundle?.costLines.length) return bundle.costLines.slice(0, limit);
  return fetchRows<ProductCostLine>("vyron_cost_product_cost_lines", demoProductCostLines, "line_name", limit);
}

export async function getRecipes(limit = 250) {
  if ((await workspaceScope()).useDemo) {
    const fromJson = getHandcraftedRecipes();
    if (fromJson.length) return fromJson.slice(0, limit);
  }
  return fetchRows<Recipe>("vyron_cost_recipes", demoRecipes, "recipe_name", limit);
}

export async function getRecipeItems(limit = 500) {
  if ((await workspaceScope()).useDemo) {
    const fromJson = getHandcraftedRecipeItems();
    if (fromJson.length) return fromJson.slice(0, limit);
  }
  return fetchRows<RecipeItem>("vyron_cost_recipe_items", demoRecipeItems, "ingredient_name_snapshot", limit);
}

export async function getProductRecipeLinks(limit = 500) {
  return fetchRows<ProductRecipeLink>("vyron_cost_product_recipe_links", demoProductRecipeLinks, "recipe_name_snapshot", limit);
}

export async function getBatchRuns(limit = 100) {
  if ((await workspaceScope()).useDemo) return getHandcraftedBatchRuns().slice(0, limit);
  return fetchRows<BatchRun>("vyron_cost_batch_runs", demoBatchRuns, "batch_number", limit);
}

export async function getCategories(limit = 250) {
  if ((await workspaceScope()).useDemo) return getHandcraftedCategories().slice(0, limit);
  return fetchRows<Category>("vyron_cost_categories", demoCategories, "category_name", limit);
}

export async function getInvoiceQueue(limit = 100) {
  return fetchRows<InvoiceQueueItem>("vyron_cost_invoice_queue", demoInvoiceQueue, "created_at", limit);
}

export async function getInvoiceExtractedLines(limit = 250) {
  return fetchRows<InvoiceExtractedLine>("vyron_cost_invoice_extracted_lines", demoInvoiceLines, "raw_description", limit);
}

export async function getUsers(limit = 100) {
  return fetchRows<VyronUser>("vyron_cost_users", demoUsers, "full_name", limit);
}

export async function getAuditLog(limit = 100) {
  return fetchRows<AuditEvent>("vyron_cost_audit_log", demoAudit, "created_at", limit);
}

export async function getPurchaseOrders(limit = 100) {
  return fetchRows<PurchaseOrder>("vyron_cost_purchase_orders", demoPurchaseOrders, "po_number", limit);
}

export async function getReports(limit = 100) {
  return fetchRows<VyronReport>("vyron_cost_reports", demoReports, "report_name", limit);
}
