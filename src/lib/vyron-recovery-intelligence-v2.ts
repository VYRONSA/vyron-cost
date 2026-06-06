import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEMO_TENANT_ID = "48002864-8800-4000-9000-000000000001";

export type RecoveryCalcRow = {
  id: string;
  opportunity_key: string;
  category: string;
  title: string;
  confidence_level: "High Confidence" | "Medium Confidence" | "Low Confidence";
  confidence_score: number;
  is_estimated: boolean;
  formula_expression: string;
  formula_inputs: Record<string, unknown>;
  missing_inputs: string[];
  products_affected: Array<{ productId: string; productName: string }>;
  recommended_action: string | null;
  monthly_recovery: number;
  annual_recovery: number;
  estimated_recovery: number;
  verified_recovery: number;
  potential_recovery: number;
  recovered_to_date: number;
  status: string;
};

export type RecoveryExecutiveSummary = {
  estimatedRecovery: number;
  verifiedRecovery: number;
  potentialRecovery: number;
  recoveredToDate: number;
};

function confidenceLevel(score: number): RecoveryCalcRow["confidence_level"] {
  if (score >= 85) return "High Confidence";
  if (score >= 65) return "Medium Confidence";
  return "Low Confidence";
}

function toNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function opportunityKey(prefix: string, id: string) {
  return `${prefix}-${id}`.toLowerCase();
}

export async function recomputeRecoveryIntelligenceV2(
  tenantId = DEMO_TENANT_ID
): Promise<RecoveryCalcRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [productIntel, movementsResponse, productsResponse, suppliersResponse, riskResponse] = await Promise.all([
    getProductIntelligence(),
    supabase
      .from("vyron_supplier_price_history")
      .select(
        "id, supplier_id, supplier_name, entity_type, entity_id, entity_name, previous_price, new_price, price_difference, percentage_change, movement_type"
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, selling_price, total_cost, target_gp")
      .eq("company_id", tenantId),
    supabase
      .from("vyron_cost_suppliers")
      .select("id, supplier_name")
      .eq("company_id", tenantId),
    supabase
      .from("vyron_procurement_risk_alerts")
      .select("id, risk_type, severity")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .limit(500),
  ]);

  const movementRows = (movementsResponse.data || []) as Array<any>;
  const productRows = (productsResponse.data || []) as Array<any>;
  const supplierRows = (suppliersResponse.data || []) as Array<any>;
  const riskRows = (riskResponse.data || []) as Array<any>;
  const intelByProduct = new Map(
    (productIntel || []).map((row) => [String(row.product_id || row.id), row] as const)
  );

  const rows: Omit<RecoveryCalcRow, "id">[] = [];

  // Ingredient Inflation (actual where recipe qty and monthly volume are available)
  const ingredientMoves = movementRows.filter(
    (m) => m.entity_type === "ingredient" && toNumber(m.new_price) > toNumber(m.previous_price)
  );
  for (const move of ingredientMoves) {
    const ingredientId = String(move.entity_id || "");
    if (!ingredientId) continue;

    const { data: recipeItems } = await supabase
      .from("vyron_cost_recipe_items")
      .select("recipe_id, quantity")
      .eq("company_id", tenantId)
      .eq("ingredient_id", ingredientId);
    const linkedRecipeIds = (recipeItems || []).map((item: any) => item.recipe_id);
    const qtyByRecipe = new Map((recipeItems || []).map((item: any) => [String(item.recipe_id), toNumber(item.quantity)]));

    const { data: productLinks } = await supabase
      .from("vyron_cost_product_recipe_links")
      .select("product_id, recipe_id")
      .eq("company_id", tenantId)
      .in("recipe_id", linkedRecipeIds.length ? linkedRecipeIds : ["00000000-0000-0000-0000-000000000000"]);

    let weightedQty = 0;
    let monthlyVolume = 0;
    const productsAffected: Array<{ productId: string; productName: string }> = [];

    for (const link of (productLinks || []) as Array<any>) {
      const pid = String(link.product_id);
      const recipeQty = qtyByRecipe.get(String(link.recipe_id)) || 0;
      const intel = intelByProduct.get(pid);
      const units = toNumber(intel?.monthly_units_estimate);
      if (units > 0 && recipeQty > 0) {
        weightedQty += recipeQty;
        monthlyVolume += units;
      }
      const product = productRows.find((p) => String(p.id) === pid);
      if (product) productsAffected.push({ productId: pid, productName: String(product.product_name) });
    }

    const previous = toNumber(move.previous_price);
    const current = toNumber(move.new_price);
    const diff = Math.max(0, current - previous);
    const averageQty = weightedQty > 0 && productsAffected.length > 0 ? weightedQty / productsAffected.length : 0;
    const monthlyRecovery =
      averageQty > 0 && monthlyVolume > 0 ? diff * averageQty * monthlyVolume : diff * 500;
    const isEstimated = !(averageQty > 0 && monthlyVolume > 0);
    const score = isEstimated ? 62 : 90;

    rows.push({
      opportunity_key: opportunityKey("ingredient-inflation", ingredientId),
      category: "Ingredient Inflation",
      title: `${String(move.entity_name || "Ingredient")} inflation impact`,
      confidence_level: confidenceLevel(score),
      confidence_score: score,
      is_estimated: isEstimated,
      formula_expression: "Price Increase × Recipe Quantity × Actual Monthly Sales Volume",
      formula_inputs: {
        ingredient: move.entity_name,
        previousPrice: previous,
        currentPrice: current,
        priceDifference: diff,
        recipeQuantity: averageQty,
        monthlySalesVolume: monthlyVolume || 500,
      },
      missing_inputs: isEstimated
        ? [
            ...(averageQty > 0 ? [] : ["recipe_quantity"]),
            ...(monthlyVolume > 0 ? [] : ["monthly_sales_volume"]),
          ]
        : [],
      products_affected: productsAffected,
      recommended_action: "Adjust selling prices or negotiate ingredient contracts.",
      monthly_recovery: monthlyRecovery,
      annual_recovery: monthlyRecovery * 12,
      estimated_recovery: isEstimated ? monthlyRecovery : 0,
      verified_recovery: isEstimated ? 0 : monthlyRecovery,
      potential_recovery: monthlyRecovery,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  // Packaging Inflation
  const packagingMoves = movementRows.filter(
    (m) => m.entity_type === "packaging" && toNumber(m.new_price) > toNumber(m.previous_price)
  );
  for (const move of packagingMoves) {
    const diff = Math.max(0, toNumber(move.new_price) - toNumber(move.previous_price));
    const impactedProducts = (productIntel || []).filter((row) => toNumber(row.monthly_units_estimate) > 0).slice(0, 8);
    const monthlyVolume = impactedProducts.reduce((s, row) => s + toNumber(row.monthly_units_estimate), 0);
    const qty = 1; // packaging unit per finished unit unless recipe mapping exists
    const isEstimated = impactedProducts.length === 0;
    const monthlyRecovery = diff * qty * (monthlyVolume || 400);
    const score = isEstimated ? 60 : 80;
    rows.push({
      opportunity_key: opportunityKey("packaging-inflation", String(move.entity_id || move.id)),
      category: "Packaging Inflation",
      title: `${String(move.entity_name || "Packaging")} inflation impact`,
      confidence_level: confidenceLevel(score),
      confidence_score: score,
      is_estimated: isEstimated,
      formula_expression: "Packaging Increase × Packaging Quantity × Monthly Sales Volume",
      formula_inputs: {
        packaging: move.entity_name,
        previousPrice: toNumber(move.previous_price),
        currentPrice: toNumber(move.new_price),
        priceDifference: diff,
        packagingQuantity: qty,
        monthlySalesVolume: monthlyVolume || 400,
      },
      missing_inputs: isEstimated ? ["monthly_sales_volume"] : [],
      products_affected: impactedProducts.map((row) => ({
        productId: String(row.product_id || row.id),
        productName: String(row.product_name || "Unknown product"),
      })),
      recommended_action: "Re-benchmark packaging suppliers and optimize pack specs.",
      monthly_recovery: monthlyRecovery,
      annual_recovery: monthlyRecovery * 12,
      estimated_recovery: isEstimated ? monthlyRecovery : 0,
      verified_recovery: isEstimated ? 0 : monthlyRecovery,
      potential_recovery: monthlyRecovery,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  // Margin Erosion / GP Recovery
  for (const product of productRows) {
    const pid = String(product.id);
    const intel = intelByProduct.get(pid);
    const sellingPrice = toNumber(product.selling_price);
    const currentCost = toNumber(product.total_cost);
    const targetGp = toNumber(product.target_gp) || 40;
    if (!(sellingPrice > 0 && currentCost > 0)) continue;
    const currentGp = ((sellingPrice - currentCost) / sellingPrice) * 100;
    if (currentGp >= targetGp) continue;
    const requiredSellingPrice = currentCost / (1 - targetGp / 100);
    const marginShortfall = Math.max(0, requiredSellingPrice - sellingPrice);
    const monthlyVolume = toNumber(intel?.monthly_units_estimate) || 1000;
    const isEstimated = !toNumber(intel?.monthly_units_estimate);
    const monthlyRecovery = marginShortfall * monthlyVolume;
    const score = isEstimated ? 64 : 92;
    rows.push({
      opportunity_key: opportunityKey("margin-erosion", pid),
      category: "Margin Erosion",
      title: `${String(product.product_name)} GP below target`,
      confidence_level: confidenceLevel(score),
      confidence_score: score,
      is_estimated: isEstimated,
      formula_expression:
        "Required Selling Price from Target GP, Margin Shortfall = Required - Current, Monthly Recovery = Margin Shortfall × Monthly Sales Volume",
      formula_inputs: {
        product: product.product_name,
        currentSellingPrice: sellingPrice,
        currentGp,
        targetGp,
        requiredSellingPrice,
        marginShortfall,
        monthlySalesVolume: monthlyVolume,
      },
      missing_inputs: isEstimated ? ["monthly_sales_volume"] : [],
      products_affected: [{ productId: pid, productName: String(product.product_name) }],
      recommended_action: "Approve repricing or reduce BOM cost to restore target GP.",
      monthly_recovery: monthlyRecovery,
      annual_recovery: monthlyRecovery * 12,
      estimated_recovery: isEstimated ? monthlyRecovery : 0,
      verified_recovery: isEstimated ? 0 : monthlyRecovery,
      potential_recovery: monthlyRecovery,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  // Supplier Benchmark
  const benchmarkByItem = new Map<string, Array<any>>();
  for (const move of movementRows) {
    const item = String(move.entity_name || move.item_description || "");
    if (!item) continue;
    const arr = benchmarkByItem.get(item) || [];
    arr.push(move);
    benchmarkByItem.set(item, arr);
  }
  for (const [item, list] of benchmarkByItem.entries()) {
    if (list.length < 2) continue;
    const sortedByPrice = [...list].sort((a, b) => toNumber(b.new_price) - toNumber(a.new_price));
    const expensive = sortedByPrice[0];
    const cheaper = sortedByPrice[sortedByPrice.length - 1];
    const costDiff = toNumber(expensive.new_price) - toNumber(cheaper.new_price);
    if (costDiff <= 0) continue;
    const expectedUsage = Math.max(
      1,
      (productIntel || []).reduce((sum, row) => sum + toNumber(row.monthly_units_estimate), 0)
    );
    const monthlyRecovery = costDiff * expectedUsage;
    const isEstimated = expectedUsage <= 1;
    const score = isEstimated ? 58 : 76;
    rows.push({
      opportunity_key: opportunityKey("supplier-benchmark", item),
      category: "Supplier Benchmark",
      title: `${String(expensive.supplier_name || "Supplier A")} is more expensive than ${String(
        cheaper.supplier_name || "Supplier B"
      )}`,
      confidence_level: confidenceLevel(score),
      confidence_score: score,
      is_estimated: isEstimated,
      formula_expression:
        "Cost Difference = Current Supplier Cost - Alternative Supplier Cost; Annualized Recovery = Cost Difference × Expected Monthly Usage × 12",
      formula_inputs: {
        item,
        currentSupplier: expensive.supplier_name,
        alternativeSupplier: cheaper.supplier_name,
        currentSupplierCost: toNumber(expensive.new_price),
        alternativeSupplierCost: toNumber(cheaper.new_price),
        costDifference: costDiff,
        expectedMonthlyUsage: expectedUsage,
      },
      missing_inputs: isEstimated ? ["expected_monthly_usage"] : [],
      products_affected: [],
      recommended_action: "Shift volume to lower-cost supplier and renegotiate current contract.",
      monthly_recovery: monthlyRecovery,
      annual_recovery: monthlyRecovery * 12,
      estimated_recovery: isEstimated ? monthlyRecovery : 0,
      verified_recovery: isEstimated ? 0 : monthlyRecovery,
      potential_recovery: monthlyRecovery,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  // Risk-based categories: Duplicate Invoice, Procurement Variance, Wastage, Labour Impact
  const duplicateCount = riskRows.filter((r) => String(r.risk_type) === "duplicate_invoice").length;
  if (duplicateCount > 0) {
    const monthly = duplicateCount * 2500;
    rows.push({
      opportunity_key: "duplicate-invoice-risk",
      category: "Duplicate Invoice",
      title: "Duplicate invoice exposure detected",
      confidence_level: "Medium Confidence",
      confidence_score: 70,
      is_estimated: true,
      formula_expression: "Estimated Recovery = Duplicate Invoice Count × Average Duplicate Invoice Value",
      formula_inputs: { duplicateInvoiceCount: duplicateCount, averageDuplicateInvoiceValue: 2500 },
      missing_inputs: ["average_duplicate_invoice_value_actual"],
      products_affected: [],
      recommended_action: "Block payment until duplicate checks are cleared.",
      monthly_recovery: monthly,
      annual_recovery: monthly * 12,
      estimated_recovery: monthly,
      verified_recovery: 0,
      potential_recovery: monthly,
      recovered_to_date: 0,
      status: "Investigating",
    });
  }

  const procurementVarianceCount = riskRows.filter((r) =>
    ["sudden_price_spike", "abnormal_supplier_increase", "missing_po_match"].includes(String(r.risk_type))
  ).length;
  if (procurementVarianceCount > 0) {
    const monthly = procurementVarianceCount * 1800;
    rows.push({
      opportunity_key: "procurement-variance-risk",
      category: "Procurement Variance",
      title: "Procurement variance and PO mismatch exposure",
      confidence_level: "Medium Confidence",
      confidence_score: 68,
      is_estimated: true,
      formula_expression: "Estimated Recovery = Procurement Variance Alerts × Average Variance Value",
      formula_inputs: { varianceAlertCount: procurementVarianceCount, averageVarianceValue: 1800 },
      missing_inputs: ["average_procurement_variance_value_actual"],
      products_affected: [],
      recommended_action: "Enforce PO-linked approvals and supplier variance thresholds.",
      monthly_recovery: monthly,
      annual_recovery: monthly * 12,
      estimated_recovery: monthly,
      verified_recovery: 0,
      potential_recovery: monthly,
      recovered_to_date: 0,
      status: "Investigating",
    });
  }

  const wastageMonthly = (productIntel || []).reduce((sum, row) => sum + toNumber(row.monthly_risk_value) * 0.08, 0);
  if (wastageMonthly > 0) {
    rows.push({
      opportunity_key: "wastage-impact",
      category: "Wastage",
      title: "Yield and wastage recovery opportunity",
      confidence_level: "Low Confidence",
      confidence_score: 55,
      is_estimated: true,
      formula_expression: "Estimated Recovery = Wastage Risk Exposure × Recoverable Wastage Ratio",
      formula_inputs: { wastageRiskExposure: wastageMonthly / 0.08, recoverableWastageRatio: 0.08 },
      missing_inputs: ["actual_wastage_volume_loss"],
      products_affected: [],
      recommended_action: "Investigate yield loss and tighten production controls.",
      monthly_recovery: wastageMonthly,
      annual_recovery: wastageMonthly * 12,
      estimated_recovery: wastageMonthly,
      verified_recovery: 0,
      potential_recovery: wastageMonthly,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  const labourMonthly = (productIntel || []).reduce((sum, row) => sum + toNumber(row.monthly_risk_value) * 0.05, 0);
  if (labourMonthly > 0) {
    rows.push({
      opportunity_key: "labour-impact",
      category: "Labour Impact",
      title: "Labour cost and utilisation recovery",
      confidence_level: "Low Confidence",
      confidence_score: 52,
      is_estimated: true,
      formula_expression: "Estimated Recovery = Labour-related Margin Exposure × Recoverable Ratio",
      formula_inputs: { labourExposure: labourMonthly / 0.05, recoverableRatio: 0.05 },
      missing_inputs: ["actual_labour_cost_variance"],
      products_affected: [],
      recommended_action: "Review labour standards and batch run efficiency.",
      monthly_recovery: labourMonthly,
      annual_recovery: labourMonthly * 12,
      estimated_recovery: labourMonthly,
      verified_recovery: 0,
      potential_recovery: labourMonthly,
      recovered_to_date: 0,
      status: "Identified",
    });
  }

  if (!rows.length) return [];

  const upsertPayload = rows.map((row) => ({
    tenant_id: tenantId,
    opportunity_key: row.opportunity_key,
    category: row.category,
    title: row.title,
    confidence_level: row.confidence_level,
    confidence_score: row.confidence_score,
    is_estimated: row.is_estimated,
    formula_expression: row.formula_expression,
    formula_inputs: row.formula_inputs,
    missing_inputs: row.missing_inputs,
    products_affected: row.products_affected,
    recommended_action: row.recommended_action,
    monthly_recovery: row.monthly_recovery,
    annual_recovery: row.annual_recovery,
    estimated_recovery: row.estimated_recovery,
    verified_recovery: row.verified_recovery,
    potential_recovery: row.potential_recovery,
    recovered_to_date: row.recovered_to_date,
    status: row.status,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from("vyron_recovery_calculations").upsert(upsertPayload, {
    onConflict: "tenant_id,opportunity_key",
  });

  const { data: stored } = await supabase
    .from("vyron_recovery_calculations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("monthly_recovery", { ascending: false })
    .limit(500);

  return ((stored || []) as Array<any>).map((row) => ({
    ...row,
    confidence_score: toNumber(row.confidence_score),
    monthly_recovery: toNumber(row.monthly_recovery),
    annual_recovery: toNumber(row.annual_recovery),
    estimated_recovery: toNumber(row.estimated_recovery),
    verified_recovery: toNumber(row.verified_recovery),
    potential_recovery: toNumber(row.potential_recovery),
    recovered_to_date: toNumber(row.recovered_to_date),
    formula_inputs: (row.formula_inputs || {}) as Record<string, unknown>,
    products_affected: (row.products_affected || []) as Array<{ productId: string; productName: string }>,
    missing_inputs: (row.missing_inputs || []) as string[],
  }));
}

export async function getRecoveryCalculationsV2(tenantId = DEMO_TENANT_ID): Promise<RecoveryCalcRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("vyron_recovery_calculations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("monthly_recovery", { ascending: false })
    .limit(500);
  return ((data || []) as Array<any>).map((row) => ({
    ...row,
    confidence_score: toNumber(row.confidence_score),
    monthly_recovery: toNumber(row.monthly_recovery),
    annual_recovery: toNumber(row.annual_recovery),
    estimated_recovery: toNumber(row.estimated_recovery),
    verified_recovery: toNumber(row.verified_recovery),
    potential_recovery: toNumber(row.potential_recovery),
    recovered_to_date: toNumber(row.recovered_to_date),
    formula_inputs: (row.formula_inputs || {}) as Record<string, unknown>,
    products_affected: (row.products_affected || []) as Array<{ productId: string; productName: string }>,
    missing_inputs: (row.missing_inputs || []) as string[],
  }));
}

export async function getRecoveryCalculationByKey(
  key: string,
  tenantId = DEMO_TENANT_ID
): Promise<RecoveryCalcRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("vyron_recovery_calculations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("opportunity_key", key)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    confidence_score: toNumber(data.confidence_score),
    monthly_recovery: toNumber(data.monthly_recovery),
    annual_recovery: toNumber(data.annual_recovery),
    estimated_recovery: toNumber(data.estimated_recovery),
    verified_recovery: toNumber(data.verified_recovery),
    potential_recovery: toNumber(data.potential_recovery),
    recovered_to_date: toNumber(data.recovered_to_date),
    formula_inputs: (data.formula_inputs || {}) as Record<string, unknown>,
    products_affected: (data.products_affected || []) as Array<{ productId: string; productName: string }>,
    missing_inputs: (data.missing_inputs || []) as string[],
  };
}

export function buildRecoveryExecutiveSummary(rows: RecoveryCalcRow[]): RecoveryExecutiveSummary {
  return {
    estimatedRecovery: rows.reduce((sum, row) => sum + toNumber(row.estimated_recovery), 0),
    verifiedRecovery: rows.reduce((sum, row) => sum + toNumber(row.verified_recovery), 0),
    potentialRecovery: rows.reduce((sum, row) => sum + toNumber(row.potential_recovery), 0),
    recoveredToDate: rows.reduce((sum, row) => sum + toNumber(row.recovered_to_date), 0),
  };
}
