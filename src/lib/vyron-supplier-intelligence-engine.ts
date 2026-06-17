import { getSupabaseAdmin } from "@/lib/supabase-server";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

type PriceHistoryRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  document_id: string | null;
  invoice_date: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  previous_price: number | null;
  new_price: number | null;
  price_difference: number | null;
  percentage_change: number | null;
  movement_type: string;
  created_at: string;
};

export type SupplierPriceWidgetSummary = {
  increasesThisMonth: number;
  decreasesThisMonth: number;
  highestIncrease: { supplierName: string; item: string; percentageChange: number } | null;
  highestDecrease: { supplierName: string; item: string; percentageChange: number } | null;
  suppliersWithMostChanges: Array<{ supplierId: string | null; supplierName: string; changes: number }>;
};

export type ProductImpactRow = {
  productId: string;
  productName: string;
  currentCost: number;
  newCost: number;
  costDifference: number;
  gpImpact: number;
  sellingPriceRequiredToMaintainGp: number;
};

export type RecoveryOpportunityInsight = {
  id: string;
  title: string;
  opportunityType: "Ingredient increase" | "Packaging increase" | "Supplier benchmark";
  monthlyRecovery: number;
  annualRecovery: number;
  confidence: number;
  description: string;
  recommendedAction: string;
  supplierName?: string;
  ingredientName?: string;
  productImpactCount: number;
};

export type RecoveryInsightDrilldown = {
  previousPrice: number;
  newPrice: number;
  percentageChange: number;
  invoiceCount: number;
  affectedProducts: ProductImpactRow[];
  recommendedAction: string;
};

export type ProcurementRiskAlert = {
  id: string;
  riskType: string;
  severity: string;
  title: string;
  description: string;
  supplierName: string;
  previousPrice: number | null;
  newPrice: number | null;
  percentageChange: number | null;
  documentId: string | null;
  createdAt: string;
};

const DEMO_TENANT_ID = "48002864-8800-4000-9000-000000000001";

function startOfMonthIso() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString();
}

function safeNum(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function calculateGpPercent(sellingPrice: number, cost: number) {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

export async function getSupplierPriceWidgetSummary(
  tenantId?: string | null
): Promise<SupplierPriceWidgetSummary> {
  const scope = await workspaceScope();
  const scopedTenantId = tenantId ?? scope.companyId ?? scope.tenantId;
  if (!scopedTenantId) {
    return {
      increasesThisMonth: 0,
      decreasesThisMonth: 0,
      highestIncrease: null,
      highestDecrease: null,
      suppliersWithMostChanges: [],
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      increasesThisMonth: 0,
      decreasesThisMonth: 0,
      highestIncrease: null,
      highestDecrease: null,
      suppliersWithMostChanges: [],
    };
  }

  const monthStart = startOfMonthIso();
  const { data } = await supabase
    .from("vyron_supplier_price_history")
    .select(
      "id, supplier_id, supplier_name, entity_name, percentage_change, movement_type, created_at"
    )
    .eq("tenant_id", scopedTenantId)
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data || []) as Array<{
    id: string;
    supplier_id: string | null;
    supplier_name: string | null;
    entity_name: string | null;
    percentage_change: number | null;
    movement_type: string;
    created_at: string;
  }>;

  const increases = rows.filter((r) => safeNum(r.percentage_change) > 0).length;
  const decreases = rows.filter((r) => safeNum(r.percentage_change) < 0).length;

  const highestIncreaseRow = rows
    .filter((r) => safeNum(r.percentage_change) > 0)
    .sort((a, b) => safeNum(b.percentage_change) - safeNum(a.percentage_change))[0];
  const highestDecreaseRow = rows
    .filter((r) => safeNum(r.percentage_change) < 0)
    .sort((a, b) => safeNum(a.percentage_change) - safeNum(b.percentage_change))[0];

  const bySupplier = new Map<string, { supplierId: string | null; supplierName: string; changes: number }>();
  for (const row of rows) {
    const key = row.supplier_id || row.supplier_name || "unknown";
    const current = bySupplier.get(key) || {
      supplierId: row.supplier_id,
      supplierName: row.supplier_name || "Unknown supplier",
      changes: 0,
    };
    current.changes += 1;
    bySupplier.set(key, current);
  }

  return {
    increasesThisMonth: increases,
    decreasesThisMonth: decreases,
    highestIncrease: highestIncreaseRow
      ? {
          supplierName: highestIncreaseRow.supplier_name || "Unknown supplier",
          item: highestIncreaseRow.entity_name || "Unknown item",
          percentageChange: safeNum(highestIncreaseRow.percentage_change),
        }
      : null,
    highestDecrease: highestDecreaseRow
      ? {
          supplierName: highestDecreaseRow.supplier_name || "Unknown supplier",
          item: highestDecreaseRow.entity_name || "Unknown item",
          percentageChange: safeNum(highestDecreaseRow.percentage_change),
        }
      : null,
    suppliersWithMostChanges: Array.from(bySupplier.values())
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 5),
  };
}

export async function getProductImpactFromRecentMovements(
  tenantId?: string | null
): Promise<ProductImpactRow[]> {
  const scopedTenantId = tenantId ?? (await workspaceScope()).tenantId;
  if (!scopedTenantId) return [];

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const monthStart = startOfMonthIso();
  const { data: movements } = await supabase
    .from("vyron_supplier_price_history")
    .select("entity_id, entity_type, new_price, previous_price")
    .eq("tenant_id", scopedTenantId)
    .in("entity_type", ["ingredient", "packaging"])
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(300);

  const movementRows = (movements || []) as Array<{
    entity_id: string | null;
    entity_type: string;
    new_price: number | null;
    previous_price: number | null;
  }>;
  const ingredientMovements = movementRows.filter((m) => m.entity_id);
  if (!ingredientMovements.length) return [];

  const ingredientIds = ingredientMovements.map((m) => String(m.entity_id));

  const [{ data: recipeItems }, { data: recipeLinks }, { data: products }] = await Promise.all([
    supabase
      .from("vyron_cost_recipe_items")
      .select("recipe_id, ingredient_id, quantity, true_unit_cost")
      .eq("company_id", scopedTenantId)
      .in("ingredient_id", ingredientIds),
    supabase
      .from("vyron_cost_product_recipe_links")
      .select("product_id, recipe_id")
      .eq("company_id", scopedTenantId),
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, total_cost, selling_price, target_gp")
      .eq("company_id", scopedTenantId),
  ]);

  const linksByRecipe = new Map<string, string[]>();
  for (const link of (recipeLinks || []) as Array<{ recipe_id: string; product_id: string }>) {
    const arr = linksByRecipe.get(link.recipe_id) || [];
    arr.push(link.product_id);
    linksByRecipe.set(link.recipe_id, arr);
  }

  const movementByIngredient = new Map<string, { previous: number; next: number }>();
  for (const move of ingredientMovements) {
    const key = String(move.entity_id);
    if (movementByIngredient.has(key)) continue;
    movementByIngredient.set(key, {
      previous: safeNum(move.previous_price),
      next: safeNum(move.new_price),
    });
  }

  const productMap = new Map<string, { productName: string; totalCost: number; sellingPrice: number; targetGp: number }>();
  for (const product of (products || []) as Array<any>) {
    productMap.set(String(product.id), {
      productName: String(product.product_name),
      totalCost: safeNum(product.total_cost),
      sellingPrice: safeNum(product.selling_price),
      targetGp: safeNum(product.target_gp) || 40,
    });
  }

  const impactByProduct = new Map<string, number>();
  for (const item of (recipeItems || []) as Array<any>) {
    const movement = movementByIngredient.get(String(item.ingredient_id));
    if (!movement) continue;
    const qty = safeNum(item.quantity);
    const perUnitDelta = movement.next - movement.previous;
    const delta = perUnitDelta * qty;
    const linkedProducts = linksByRecipe.get(String(item.recipe_id)) || [];
    for (const productId of linkedProducts) {
      impactByProduct.set(productId, safeNum(impactByProduct.get(productId)) + delta);
    }
  }

  const impacts: ProductImpactRow[] = [];
  for (const [productId, costDiff] of impactByProduct.entries()) {
    const product = productMap.get(productId);
    if (!product) continue;
    const currentCost = product.totalCost;
    const newCost = currentCost + costDiff;
    const gpImpact = calculateGpPercent(product.sellingPrice, newCost) - calculateGpPercent(product.sellingPrice, currentCost);
    const requiredPrice = newCost / (1 - product.targetGp / 100);
    impacts.push({
      productId,
      productName: product.productName,
      currentCost,
      newCost,
      costDifference: costDiff,
      gpImpact,
      sellingPriceRequiredToMaintainGp: Number.isFinite(requiredPrice) ? requiredPrice : product.sellingPrice,
    });
  }

  return impacts.sort((a, b) => Math.abs(b.costDifference) - Math.abs(a.costDifference));
}

export async function getPhase4RecoveryInsights(
  tenantId?: string | null
): Promise<RecoveryOpportunityInsight[]> {
  const scopedTenantId = tenantId ?? (await workspaceScope()).tenantId;
  if (!scopedTenantId) return [];

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const monthStart = startOfMonthIso();
  const [{ data: movements }, productImpacts] = await Promise.all([
    supabase
      .from("vyron_supplier_price_history")
      .select("supplier_name, entity_type, entity_name, percentage_change, price_difference")
      .eq("tenant_id", scopedTenantId)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(1000),
    getProductImpactFromRecentMovements(scopedTenantId),
  ]);

  const rows = (movements || []) as Array<{
    supplier_name: string | null;
    entity_type: string;
    entity_name: string | null;
    percentage_change: number | null;
    price_difference: number | null;
  }>;

  const increases = rows.filter((r) => safeNum(r.percentage_change) > 0);
  const ingredientIncreases = increases.filter((r) => r.entity_type === "ingredient");
  const packagingIncreases = increases.filter((r) => r.entity_type === "packaging");

  const ingredientMonthlyRecovery = ingredientIncreases.reduce(
    (sum, row) => sum + Math.max(0, safeNum(row.price_difference)) * 500,
    0
  );
  const packagingMonthlyRecovery = packagingIncreases.reduce(
    (sum, row) => sum + Math.max(0, safeNum(row.price_difference)) * 400,
    0
  );

  const supplierByItem = new Map<string, Array<{ supplier: string; pct: number }>>();
  for (const row of rows) {
    const item = row.entity_name || "";
    if (!item) continue;
    const arr = supplierByItem.get(item) || [];
    arr.push({ supplier: row.supplier_name || "Unknown supplier", pct: safeNum(row.percentage_change) });
    supplierByItem.set(item, arr);
  }

  let bestBenchmark: RecoveryOpportunityInsight | null = null;
  for (const [item, list] of supplierByItem.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.pct - a.pct);
    const expensive = sorted[0];
    const cheaper = sorted[sorted.length - 1];
    const gap = expensive.pct - cheaper.pct;
    if (gap <= 0) continue;
    const monthlyRecovery = gap * 45.61;
    const candidate: RecoveryOpportunityInsight = {
      id: `phase4-benchmark-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${expensive.supplier} is ${gap.toFixed(1)}% more expensive than ${cheaper.supplier}`,
      opportunityType: "Supplier benchmark",
      monthlyRecovery,
      annualRecovery: monthlyRecovery * 12,
      confidence: 72,
      description: `Supplier benchmark variance detected on ${item}.`,
      recommendedAction: `Benchmark ${item} sourcing and negotiate with ${expensive.supplier}.`,
      supplierName: expensive.supplier,
      productImpactCount: productImpacts.length,
    };
    if (!bestBenchmark || candidate.monthlyRecovery > bestBenchmark.monthlyRecovery) {
      bestBenchmark = candidate;
    }
  }

  const insights: RecoveryOpportunityInsight[] = [];
  if (ingredientMonthlyRecovery > 0) {
    insights.push({
      id: "phase4-ingredient-increase",
      title: "Ingredient increase not yet reflected in selling price",
      opportunityType: "Ingredient increase",
      monthlyRecovery: ingredientMonthlyRecovery,
      annualRecovery: ingredientMonthlyRecovery * 12,
      confidence: 78,
      description: "Recent ingredient cost increases are reducing GP on linked products.",
      recommendedAction: "Review impacted products and adjust selling prices to restore target GP.",
      productImpactCount: productImpacts.length,
    });
  }
  if (packagingMonthlyRecovery > 0) {
    insights.push({
      id: "phase4-packaging-increase",
      title: "Packaging increase reducing GP",
      opportunityType: "Packaging increase",
      monthlyRecovery: packagingMonthlyRecovery,
      annualRecovery: packagingMonthlyRecovery * 12,
      confidence: 74,
      description: "Packaging line cost increases detected on approved invoices.",
      recommendedAction: "Negotiate packaging inputs and optimize pack spec on top-volume SKUs.",
      productImpactCount: productImpacts.length,
    });
  }
  if (bestBenchmark) insights.push(bestBenchmark);

  return insights.sort((a, b) => b.monthlyRecovery - a.monthlyRecovery);
}

export async function getRecoveryInsightDrilldown(
  insightId: string,
  tenantId?: string | null
): Promise<RecoveryInsightDrilldown | null> {
  const scopedTenantId = tenantId ?? (await workspaceScope()).tenantId;
  if (!scopedTenantId) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const monthStart = startOfMonthIso();
  const { data: movements } = await supabase
    .from("vyron_supplier_price_history")
    .select("previous_price, new_price, percentage_change, document_id")
    .eq("tenant_id", scopedTenantId)
    .gte("created_at", monthStart)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (movements || []) as Array<{
    previous_price: number | null;
    new_price: number | null;
    percentage_change: number | null;
    document_id: string | null;
  }>;
  if (!rows.length) return null;

  let selected = rows[0];
  if (insightId.includes("packaging")) {
    selected = rows.find((row) => safeNum(row.percentage_change) > 0) || rows[0];
  } else if (insightId.includes("benchmark")) {
    selected = rows.sort((a, b) => safeNum(b.percentage_change) - safeNum(a.percentage_change))[0];
  }

  const productImpacts = await getProductImpactFromRecentMovements(scopedTenantId);
  return {
    previousPrice: safeNum(selected.previous_price),
    newPrice: safeNum(selected.new_price),
    percentageChange: safeNum(selected.percentage_change),
    invoiceCount: new Set(rows.map((row) => row.document_id).filter(Boolean)).size,
    affectedProducts: productImpacts.slice(0, 10),
    recommendedAction:
      insightId.includes("benchmark")
        ? "Switch volume to lower-cost supplier and renegotiate contract tiers."
        : "Update pricing approvals and recover GP on impacted products.",
  };
}

export async function getProcurementRiskAlerts(
  tenantId?: string | null
): Promise<ProcurementRiskAlert[]> {
  const scopedTenantId = tenantId ?? (await workspaceScope()).tenantId;
  if (!scopedTenantId) return [];

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data } = await supabase
    .from("vyron_procurement_risk_alerts")
    .select("id, risk_type, severity, title, description, supplier_name, previous_price, new_price, percentage_change, document_id, created_at")
    .eq("tenant_id", scopedTenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  return ((data || []) as Array<any>).map((row) => ({
    id: String(row.id),
    riskType: String(row.risk_type || "risk"),
    severity: String(row.severity || "medium"),
    title: String(row.title || "Procurement risk"),
    description: String(row.description || ""),
    supplierName: String(row.supplier_name || "Unknown supplier"),
    previousPrice: row.previous_price ?? null,
    newPrice: row.new_price ?? null,
    percentageChange: row.percentage_change ?? null,
    documentId: row.document_id ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
  }));
}
