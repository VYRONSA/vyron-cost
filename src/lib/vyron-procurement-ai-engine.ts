import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";
import { getRecoveryTrackingExecutiveStats } from "@/lib/vyron-cost-recovery-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEMO_TENANT_ID = "48002864-8800-4000-9000-000000000001";

export const PROCUREMENT_RECOMMENDATION_CATEGORIES = [
  "Price Increase",
  "Supplier Switch",
  "Selling Price Adjustment",
  "Purchase Consolidation",
  "Contract Renegotiation",
  "Duplicate Invoice Prevention",
  "Inventory Optimization",
  "Margin Recovery",
  "Production Improvement",
  "Yield Improvement",
  "Waste Reduction",
] as const;

export const PROCUREMENT_WORKFLOW_STATUSES = [
  "New",
  "Assigned",
  "Under Review",
  "Accepted",
  "Rejected",
  "Implemented",
  "Closed",
] as const;

export type ProcurementRecommendationCategory = (typeof PROCUREMENT_RECOMMENDATION_CATEGORIES)[number];

export type GeneratedProcurementRecommendation = {
  recommendation_key: string;
  category: ProcurementRecommendationCategory;
  title: string;
  summary: string;
  problem_statement?: string;
  cause_statement?: string;
  recommended_action: string;
  why_exists: string;
  data_used: Record<string, unknown>;
  formula_expression: string;
  confidence_score: number;
  confidence_level: "High Confidence" | "Medium Confidence" | "Low Confidence";
  is_estimated: boolean;
  missing_inputs: string[];
  affected_products: Array<{ productId: string; productName: string }>;
  affected_suppliers: Array<{ supplierId: string | null; supplierName: string }>;
  expected_result: string;
  potential_benefit_monthly: number;
  potential_benefit_annual: number;
  expected_gp_improvement_pct?: number;
  selling_price_adjustment?: number;
  source_type?: string;
  source_recovery_key?: string;
};

export type ProcurementHealthScore = {
  overall: number;
  supplierRisk: number;
  priceStability: number;
  inventoryHealth: number;
  recoveryPerformance: number;
  poCompliance: number;
  invoiceCompliance: number;
  productionEfficiency: number;
  /** @deprecated use supplierRisk — kept for backward compatibility */
  supplierConcentration: number;
  duplicateInvoices: number;
  marginTrends: number;
  costInflation: number;
  notes: string[];
};

function buildRec(partial: Omit<GeneratedProcurementRecommendation, "problem_statement" | "cause_statement"> & {
  problem_statement?: string;
  cause_statement?: string;
}): GeneratedProcurementRecommendation {
  const row = { ...partial } as GeneratedProcurementRecommendation;
  row.problem_statement = partial.problem_statement || partial.summary;
  row.cause_statement = partial.cause_statement || partial.why_exists;
  return row;
}

function toNum(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function confidenceLevel(score: number): GeneratedProcurementRecommendation["confidence_level"] {
  if (score >= 85) return "High Confidence";
  if (score >= 65) return "Medium Confidence";
  return "Low Confidence";
}

function recKey(category: string, suffix: string) {
  return `proc-ai-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`.slice(0, 120);
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function generateProcurementRecommendations(
  tenantId = DEMO_TENANT_ID
): Promise<GeneratedProcurementRecommendation[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const monthStart = monthStartIso();
  const [movementsRes, productsRes, riskRes, productIntel, recoveryStats, widgets] = await Promise.all([
    supabase
      .from("vyron_supplier_price_history")
      .select(
        "id, supplier_id, supplier_name, entity_type, entity_id, entity_name, previous_price, new_price, price_difference, percentage_change, movement_type, invoice_date"
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
      .from("vyron_procurement_risk_alerts")
      .select("id, risk_type, severity, title, description, supplier_name, document_id, percentage_change")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .limit(200),
    getProductIntelligence(),
    getRecoveryTrackingExecutiveStats(),
    getSupplierPriceWidgetSummary(tenantId),
  ]);

  const movements = (movementsRes.data || []) as Array<Record<string, unknown>>;
  const products = (productsRes.data || []) as Array<Record<string, unknown>>;
  const risks = (riskRes.data || []) as Array<Record<string, unknown>>;
  const rows: GeneratedProcurementRecommendation[] = [];
  const missingGlobal: string[] = [];
  if (!movements.length) missingGlobal.push("No supplier price movements this month (using product costing only where available).");

  // —— Price Increase (supplier-level aggregate) ——
  const bySupplier = new Map<
    string,
    { supplierId: string | null; supplierName: string; maxPct: number; items: string[]; totalDiff: number }
  >();
  for (const m of movements) {
    if (toNum(m.percentage_change) <= 0) continue;
    const key = String(m.supplier_id || m.supplier_name || "unknown");
    const cur = bySupplier.get(key) || {
      supplierId: (m.supplier_id as string) || null,
      supplierName: String(m.supplier_name || "Unknown supplier"),
      maxPct: 0,
      items: [],
      totalDiff: 0,
    };
    cur.maxPct = Math.max(cur.maxPct, toNum(m.percentage_change));
    cur.totalDiff += Math.max(0, toNum(m.price_difference));
    const item = String(m.entity_name || "");
    if (item && !cur.items.includes(item)) cur.items.push(item);
    bySupplier.set(key, cur);
  }
  for (const [key, agg] of bySupplier.entries()) {
    if (agg.maxPct < 3) continue;
    const monthlyUnits = 500;
    const monthlyBenefit = Math.max(agg.totalDiff * monthlyUnits, agg.maxPct * 120);
    const annual = monthlyBenefit * 12;
    const missing: string[] = [];
    if (!agg.totalDiff) missing.push("Monthly purchase volume (assumed 500 units/item for annualization).");
    rows.push({
      recommendation_key: recKey("price-increase", key.slice(0, 36)),
      category: "Price Increase",
      title: `${agg.supplierName} increased prices by ${agg.maxPct.toFixed(1)}%`,
      summary: `Detected on ${agg.items.slice(0, 3).join(", ") || "invoice lines"} from approved supplier price history.`,
      recommended_action:
        agg.maxPct >= 8
          ? `Negotiate pricing with ${agg.supplierName} or move 40% of volume to an alternate supplier.`
          : `Request revised pricing from ${agg.supplierName} and lock contract rates for 12 months.`,
      why_exists: `${agg.supplierName} shows ${agg.maxPct.toFixed(1)}% upward movement across ${agg.items.length || 1} line(s) in vyron_supplier_price_history (current month).`,
      data_used: {
        supplierId: agg.supplierId,
        supplierName: agg.supplierName,
        maxPercentageChange: agg.maxPct,
        itemsAffected: agg.items,
        priceDifferenceSum: agg.totalDiff,
        sourceTable: "vyron_supplier_price_history",
        periodFrom: monthStart,
      },
      formula_expression: "annual_benefit = max(sum(price_difference) × monthly_units, max_pct × 120) × 12",
      confidence_score: missing.length ? 68 : agg.maxPct >= 8 ? 94 : 82,
      confidence_level: confidenceLevel(missing.length ? 68 : agg.maxPct >= 8 ? 94 : 82),
      is_estimated: Boolean(missing.length),
      missing_inputs: missing,
      affected_products: [],
      affected_suppliers: [{ supplierId: agg.supplierId, supplierName: agg.supplierName }],
      expected_result: `Potential recovery R${annual.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}/year if pricing is renegotiated to prior levels.`,
      potential_benefit_monthly: monthlyBenefit,
      potential_benefit_annual: annual,
    });
  }

  // —— Packaging / ingredient → Selling Price Adjustment ——
  const packagingMoves = movements.filter(
    (m) => m.entity_type === "packaging" && toNum(m.percentage_change) > 0
  );
  for (const move of packagingMoves.slice(0, 5)) {
    const pct = toNum(move.percentage_change);
    const prev = toNum(move.previous_price);
    const next = toNum(move.new_price);
    const priceAdj = Math.max(0.01, Math.round((next - prev) * 100) / 100);
    const gpImprovement = Math.min(3.5, Math.max(0.4, pct * 0.1));
    const entityName = String(move.entity_name || "Packaging");
    const impacted = (productIntel || [])
      .filter((p) => Number(p.gp_gap || 0) > 0)
      .slice(0, 5)
      .map((p) => ({
        productId: String(p.product_id || p.id),
        productName: String(p.product_name),
      }));
    rows.push({
      recommendation_key: recKey("selling-price", String(move.id || entityName)),
      category: "Selling Price Adjustment",
      title: `${entityName} cost increased (${pct.toFixed(1)}%)`,
      summary: `Packaging/input price movement requires selling price review on ${impacted.length || "linked"} products.`,
      recommended_action: `Increase selling price by R${priceAdj.toFixed(2)} on affected SKUs to protect target GP.`,
      why_exists: `Packaging line "${entityName}" moved from R${prev.toFixed(2)} to R${next.toFixed(2)} (${pct.toFixed(1)}%) per vyron_supplier_price_history.`,
      data_used: {
        entityName,
        previousPrice: prev,
        newPrice: next,
        percentageChange: pct,
        sourceTable: "vyron_supplier_price_history",
      },
      formula_expression: "price_adjustment = new_price − previous_price; gp_improvement_pct ≈ pct_change × 0.1",
      confidence_score: impacted.length ? 78 : 62,
      confidence_level: confidenceLevel(impacted.length ? 78 : 62),
      is_estimated: !impacted.length,
      missing_inputs: impacted.length ? [] : ["Product BOM linkage for exact SKU impact (using GP gap proxy)."],
      affected_products: impacted,
      affected_suppliers: [{ supplierId: (move.supplier_id as string) || null, supplierName: String(move.supplier_name || "Supplier") }],
      expected_result: `Expected GP improvement ~${gpImprovement.toFixed(1)}% if adjustment is applied.`,
      potential_benefit_monthly: priceAdj * 800,
      potential_benefit_annual: priceAdj * 800 * 12,
      expected_gp_improvement_pct: gpImprovement,
      selling_price_adjustment: priceAdj,
    });
  }

  // —— Supplier Switch (benchmark) ——
  const byItem = new Map<string, Array<{ supplier: string; supplierId: string | null; pct: number; diff: number }>>();
  for (const m of movements) {
    const item = String(m.entity_name || "").trim();
    if (!item) continue;
    const arr = byItem.get(item) || [];
    arr.push({
      supplier: String(m.supplier_name || "Unknown"),
      supplierId: (m.supplier_id as string) || null,
      pct: toNum(m.percentage_change),
      diff: toNum(m.price_difference),
    });
    byItem.set(item, arr);
  }
  for (const [item, list] of byItem.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.pct - b.pct);
    const cheaper = sorted[0];
    const expensive = sorted[sorted.length - 1];
    const gap = expensive.pct - cheaper.pct;
    if (gap < 5) continue;
    const monthly = Math.max(gap * 184.17, 1841);
    const annual = monthly * 12;
    rows.push({
      recommendation_key: recKey("supplier-switch", item.slice(0, 40)),
      category: "Supplier Switch",
      title: `${cheaper.supplier} is ${gap.toFixed(0)}% cheaper than ${expensive.supplier} on ${item}`,
      summary: `Benchmark spread on "${item}" from concurrent supplier price observations.`,
      recommended_action: `Move 60% of purchasing volume from ${expensive.supplier} to ${cheaper.supplier} for ${item}.`,
      why_exists: `Price history shows ${gap.toFixed(1)}% spread between suppliers on the same item this month.`,
      data_used: { item, cheaperSupplier: cheaper.supplier, expensiveSupplier: expensive.supplier, gapPct: gap },
      formula_expression: "annual_benefit = max(gap_pct × 184.17, 1841) × 12  (volume-weighted benchmark)",
      confidence_score: 74,
      confidence_level: "Medium Confidence",
      is_estimated: true,
      missing_inputs: ["Exact monthly purchase volume per supplier (60% shift assumed)."],
      affected_products: [],
      affected_suppliers: [
        { supplierId: cheaper.supplierId, supplierName: cheaper.supplier },
        { supplierId: expensive.supplierId, supplierName: expensive.supplier },
      ],
      expected_result: `Potential recovery R${annual.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}/year at 60% volume shift.`,
      potential_benefit_monthly: monthly,
      potential_benefit_annual: annual,
    });
  }

  // —— Purchase Consolidation ——
  for (const s of widgets.suppliersWithMostChanges.slice(0, 2)) {
    if (s.changes < 3) continue;
    const monthly = s.changes * 420;
    rows.push({
      recommendation_key: recKey("consolidation", String(s.supplierId || s.supplierName)),
      category: "Purchase Consolidation",
      title: `Consolidate purchasing with ${s.supplierName}`,
      summary: `${s.changes} price movements this month — high negotiation leverage.`,
      recommended_action: `Bundle lines with ${s.supplierName} into a single monthly PO and request volume rebate.`,
      why_exists: `${s.supplierName} recorded ${s.changes} price changes in the current month (top volatility).`,
      data_used: { supplierId: s.supplierId, changes: s.changes, source: "supplier_price_widget" },
      formula_expression: "annual_benefit = price_changes × R420 × 12",
      confidence_score: 70,
      confidence_level: "Medium Confidence",
      is_estimated: true,
      missing_inputs: ["Historical PO volume by supplier"],
      affected_products: [],
      affected_suppliers: [{ supplierId: s.supplierId, supplierName: s.supplierName }],
      expected_result: `Estimated R${(monthly * 12).toLocaleString("en-ZA")}/year from consolidated terms.`,
      potential_benefit_monthly: monthly,
      potential_benefit_annual: monthly * 12,
    });
  }

  // —— Contract Renegotiation (large increases) ——
  for (const [key, agg] of bySupplier.entries()) {
    if (agg.maxPct < 10) continue;
    const annual = agg.maxPct * 1500;
    rows.push({
      recommendation_key: recKey("contract", key.slice(0, 36)),
      category: "Contract Renegotiation",
      title: `Renegotiate contract with ${agg.supplierName}`,
      summary: `Sustained increases above 10% trigger contract review.`,
      recommended_action: `Schedule contract review with ${agg.supplierName}; target CPI + 2% cap for 12 months.`,
      why_exists: `Maximum observed increase ${agg.maxPct.toFixed(1)}% exceeds 10% contract review threshold.`,
      data_used: { supplierName: agg.supplierName, maxPct: agg.maxPct, thresholdPct: 10 },
      formula_expression: "annual_benefit = max_pct × R1,500 (negotiated rebate proxy)",
      confidence_score: 76,
      confidence_level: "Medium Confidence",
      is_estimated: true,
      missing_inputs: ["Signed contract expiry date"],
      affected_products: [],
      affected_suppliers: [{ supplierId: agg.supplierId, supplierName: agg.supplierName }],
      expected_result: `Protect margin on R${annual.toLocaleString("en-ZA")}/year spend exposure.`,
      potential_benefit_monthly: annual / 12,
      potential_benefit_annual: annual,
    });
  }

  // —— Duplicate Invoice Prevention ——
  const duplicateRisks = risks.filter((r) =>
    String(r.risk_type || "").toLowerCase().includes("duplicate")
  );
  for (const risk of duplicateRisks.slice(0, 5)) {
    const annual = 12000;
    rows.push({
      recommendation_key: recKey("duplicate", String(risk.id)),
      category: "Duplicate Invoice Prevention",
      title: String(risk.title || "Duplicate invoice risk"),
      summary: String(risk.description || "Open procurement risk alert."),
      recommended_action: "Block duplicate payment; require 3-way match before release.",
      why_exists: `Open alert in vyron_procurement_risk_alerts (${risk.severity} severity).`,
      data_used: {
        alertId: risk.id,
        riskType: risk.risk_type,
        documentId: risk.document_id,
        sourceTable: "vyron_procurement_risk_alerts",
      },
      formula_expression: "annual_benefit = duplicate_exposure_proxy (R12,000 per prevented duplicate)",
      confidence_score: risk.document_id ? 88 : 72,
      confidence_level: confidenceLevel(risk.document_id ? 88 : 72),
      is_estimated: !risk.document_id,
      missing_inputs: risk.document_id ? [] : ["Linked invoice document for exact duplicate amount"],
      affected_products: [],
      affected_suppliers: [{ supplierId: null, supplierName: String(risk.supplier_name || "Unknown") }],
      expected_result: "Prevent duplicate payment and strengthen AP controls.",
      potential_benefit_monthly: annual / 12,
      potential_benefit_annual: annual,
    });
  }

  // —— Margin Recovery (products below target GP) ——
  for (const p of (productIntel || []).filter((row) => toNum(row.gp_gap) > 0).slice(0, 6)) {
    const gap = toNum(p.gp_gap);
    const monthlyRisk = toNum(p.monthly_risk_value);
    const annual = monthlyRisk > 0 ? monthlyRisk * 12 : gap * 250;
    rows.push({
      recommendation_key: recKey("margin", String(p.product_id || p.id)),
      category: "Margin Recovery",
      title: `Recover margin on ${p.product_name}`,
      summary: `GP ${toNum(p.actual_gp).toFixed(1)}% vs target ${toNum(p.target_gp).toFixed(1)}% (gap ${gap.toFixed(1)} pp).`,
      recommended_action: `Review recipe cost, supplier pricing, and selling price for ${p.product_name}.`,
      why_exists: `Product intelligence shows GP gap of ${gap.toFixed(1)} percentage points.`,
      data_used: {
        productId: p.product_id || p.id,
        currentGp: p.actual_gp,
        targetGp: p.target_gp,
        monthlyRiskValue: monthlyRisk,
        source: "vyron_product_intelligence",
      },
      formula_expression: "annual_benefit = monthly_risk_value × 12 OR gp_gap × R250",
      confidence_score: monthlyRisk > 0 ? 84 : 66,
      confidence_level: confidenceLevel(monthlyRisk > 0 ? 84 : 66),
      is_estimated: monthlyRisk <= 0,
      missing_inputs: monthlyRisk > 0 ? [] : ["Monthly sales volume for exact margin recovery"],
      affected_products: [{ productId: String(p.product_id || p.id), productName: String(p.product_name) }],
      affected_suppliers: [],
      expected_result: `Recover up to R${annual.toLocaleString("en-ZA")}/year margin at target GP.`,
      potential_benefit_monthly: annual / 12,
      potential_benefit_annual: annual,
      expected_gp_improvement_pct: gap,
    });
  }

  // —— Inventory Optimization (high movement ingredients) ——
  const ingredientMoves = movements.filter((m) => m.entity_type === "ingredient");
  const byIngredient = new Map<string, number>();
  for (const m of ingredientMoves) {
    const id = String(m.entity_id || m.entity_name || "");
    if (!id) continue;
    byIngredient.set(id, (byIngredient.get(id) || 0) + 1);
  }
  for (const [ingId, count] of Array.from(byIngredient.entries())
    .filter(([, c]) => c >= 2)
    .slice(0, 3)) {
    const move = ingredientMoves.find((m) => String(m.entity_id || m.entity_name) === ingId);
    const name = String(move?.entity_name || ingId);
    const annual = count * 3200;
    rows.push({
      recommendation_key: recKey("inventory", ingId.slice(0, 40)),
      category: "Inventory Optimization",
      title: `Stabilize stock policy for ${name}`,
      summary: `${count} price movements this month — review safety stock and order frequency.`,
      recommended_action: `Reduce emergency buys; align MOQ with ${name} consumption forecast.`,
      why_exists: `${count} ingredient price events detected — volatility increases holding cost.`,
      data_used: { ingredientId: ingId, ingredientName: name, movementCount: count },
      formula_expression: "annual_benefit = movement_count × R3,200 (holding + rush-order proxy)",
      confidence_score: 64,
      confidence_level: "Medium Confidence",
      is_estimated: true,
      missing_inputs: ["Warehouse on-hand qty and days cover"],
      affected_products: [],
      affected_suppliers: move
        ? [{ supplierId: (move.supplier_id as string) || null, supplierName: String(move.supplier_name || "Supplier") }]
        : [],
      expected_result: `Estimated R${annual.toLocaleString("en-ZA")}/year from optimized ordering.`,
      potential_benefit_monthly: annual / 12,
      potential_benefit_annual: annual,
    });
  }

  // —— PO variances ——
  if (supabase) {
    const { data: pos } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id, po_number, supplier_name_snapshot, variance, total, status")
      .eq("company_id", tenantId)
      .neq("status", "Cancelled")
      .limit(200);
    for (const po of pos || []) {
      const variance = Math.abs(toNum(po.variance));
      if (variance < 50) continue;
      const annual = variance * 12;
      rows.push(
        buildRec({
          recommendation_key: recKey("po-variance", String(po.id)),
          category: "Purchase Consolidation",
          title: `PO ${po.po_number} has R${variance.toFixed(0)} variance`,
          summary: `Purchase order total differs from expected by R${variance.toFixed(2)}.`,
          problem_statement: `PO ${po.po_number} (${po.supplier_name_snapshot}) recorded a cost variance.`,
          cause_statement: "Ordered vs received/invoiced quantities or prices do not align on vyron_cost_purchase_orders.",
          recommended_action: "Reconcile GRN and invoice lines against PO before payment release.",
          why_exists: `PO variance field = R${variance.toFixed(2)} on status ${po.status}.`,
          data_used: { poId: po.id, poNumber: po.po_number, variance, sourceTable: "vyron_cost_purchase_orders" },
          formula_expression: "annual_exposure = abs(variance) × 12",
          confidence_score: 86,
          confidence_level: confidenceLevel(86),
          is_estimated: false,
          missing_inputs: [],
          affected_products: [],
          affected_suppliers: [{ supplierId: null, supplierName: String(po.supplier_name_snapshot || "Supplier") }],
          expected_result: `Avoid R${annual.toLocaleString("en-ZA")}/year leakage from PO mismatch.`,
          potential_benefit_monthly: variance,
          potential_benefit_annual: annual,
          source_type: "purchase_order",
        })
      );
    }

    const { data: overstock } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, description, qty_on_hand, max_level, average_cost, inventory_value, stock_status, entity_type")
      .eq("company_id", tenantId)
      .in("stock_status", ["Overstock", "Slow Moving"])
      .limit(15);

    for (const item of overstock || []) {
      const qty = toNum(item.qty_on_hand);
      const max = toNum(item.max_level);
      const excess = max > 0 ? Math.max(0, qty - max) : qty * 0.3;
      const excessValue = round2(excess * toNum(item.average_cost));
      if (excessValue < 500) continue;
      const isSlow = item.stock_status === "Slow Moving";
      rows.push(
        buildRec({
          recommendation_key: recKey("inventory", String(item.id)),
          category: "Inventory Optimization",
          title: isSlow
            ? `${item.description} is slow moving`
            : `${item.description} exceeds max stock level`,
          summary: isSlow
            ? `${item.description} has limited movement — excess holding cost.`
            : `On-hand ${qty} vs max ${max} — excess value R${excessValue.toLocaleString("en-ZA")}.`,
          problem_statement: isSlow
            ? `${item.description} stock exceeds 90-day usage proxy.`
            : `${item.description} on-hand quantity exceeds policy max.`,
          cause_statement: isSlow
            ? "No recent ledger movement on vyron_cost_stock_items."
            : "Purchasing above max_level on vyron_cost_stock_items.",
          recommended_action: isSlow ? "Reduce purchasing and consider promotion or transfer." : "Reduce purchasing on next PO cycle.",
          why_exists: `Stock status ${item.stock_status}; excess value R${excessValue.toFixed(0)}.`,
          data_used: {
            stockItemId: item.id,
            qtyOnHand: qty,
            maxLevel: max,
            excessValue,
            entityType: item.entity_type,
            sourceTable: "vyron_cost_stock_items",
          },
          formula_expression: "excess_value = excess_qty × average_cost",
          confidence_score: isSlow ? 72 : 80,
          confidence_level: confidenceLevel(isSlow ? 72 : 80),
          is_estimated: !max,
          missing_inputs: max ? [] : ["Max stock level not set — using 30% of on-hand as excess proxy."],
          affected_products: [],
          affected_suppliers: [],
          expected_result: `Release R${excessValue.toLocaleString("en-ZA")} tied-up cash.`,
          potential_benefit_monthly: excessValue / 12,
          potential_benefit_annual: excessValue,
          source_type: "inventory",
        })
      );
    }

    const monthStartProd = monthStartIso();
    const { data: prodRuns } = await supabase
      .from("vyron_cost_production_runs")
      .select("id, run_number, bom_name_snapshot, yield_pct, yield_status, wastage_pct, planned_qty, actual_qty, completed_at")
      .eq("company_id", tenantId)
      .eq("status", "Completed")
      .gte("completed_at", monthStartProd)
      .order("completed_at", { ascending: false })
      .limit(20);

    for (const run of prodRuns || []) {
      const yieldPct = toNum(run.yield_pct);
      if (yieldPct > 0 && yieldPct < 93) {
        const drop = 100 - yieldPct;
        rows.push(
          buildRec({
            recommendation_key: recKey("yield", String(run.id)),
            category: "Yield Improvement",
            title: `${run.bom_name_snapshot} yield dropped to ${yieldPct}%`,
            summary: `Run ${run.run_number}: planned ${run.planned_qty}, actual ${run.actual_qty}.`,
            problem_statement: `${run.bom_name_snapshot} production yield is ${yieldPct}% (${run.yield_status}).`,
            cause_statement: "Actual output below planned batch quantity on completed production run.",
            recommended_action: "Review production process, batch size, and ingredient prep yield on the line.",
            why_exists: `vyron_cost_production_runs yield_pct = ${yieldPct}% for ${run.run_number}.`,
            data_used: { runId: run.id, runNumber: run.run_number, yieldPct, sourceTable: "vyron_cost_production_runs" },
            formula_expression: "yield_pct = actual_qty ÷ planned_qty × 100",
            confidence_score: 88,
            confidence_level: confidenceLevel(88),
            is_estimated: false,
            missing_inputs: [],
            affected_products: [],
            affected_suppliers: [],
            expected_result: `Recover ~${drop.toFixed(0)}% output loss on future batches.`,
            potential_benefit_monthly: drop * 420,
            potential_benefit_annual: drop * 420 * 12,
            source_type: "production",
          })
        );
      }
      const wastage = toNum(run.wastage_pct);
      if (wastage >= 6) {
        rows.push(
          buildRec({
            recommendation_key: recKey("waste", String(run.id)),
            category: "Waste Reduction",
            title: `Wastage on ${run.bom_name_snapshot} at ${wastage}%`,
            summary: `Production run ${run.run_number} reported elevated wastage.`,
            problem_statement: `Wastage on ${run.bom_name_snapshot} reached ${wastage}% this run.`,
            cause_statement: "Ingredient or packaging waste above target on vyron_cost_production_runs.",
            recommended_action: "Audit wastage lines on the run and tighten BOM quantities or prep standards.",
            why_exists: `Production wastage_pct = ${wastage}% on ${run.run_number}.`,
            data_used: { runId: run.id, wastagePct: wastage, sourceTable: "vyron_cost_production_runs" },
            formula_expression: "wastage_pct from production completion posting",
            confidence_score: 84,
            confidence_level: confidenceLevel(84),
            is_estimated: false,
            missing_inputs: [],
            affected_products: [],
            affected_suppliers: [],
            expected_result: "Reduce ingredient and packaging write-offs on future runs.",
            potential_benefit_monthly: wastage * 350,
            potential_benefit_annual: wastage * 350 * 12,
            source_type: "production",
          })
        );
      }
      if (yieldPct >= 93 && yieldPct <= 97) {
        rows.push(
          buildRec({
            recommendation_key: recKey("production-improve", String(run.id)),
            category: "Production Improvement",
            title: `Stabilize ${run.bom_name_snapshot} production efficiency`,
            summary: `Yield ${yieldPct}% — room to reach on-target output.`,
            problem_statement: `${run.bom_name_snapshot} is slightly under target yield.`,
            cause_statement: "Batch output consistently below 100% planned on recent runs.",
            recommended_action: "Standardize batch weights and line checks before scaling volume.",
            why_exists: `Completed run ${run.run_number} at ${yieldPct}% yield.`,
            data_used: { runId: run.id, yieldPct },
            formula_expression: "efficiency_gap = 100 − yield_pct",
            confidence_score: 70,
            confidence_level: "Medium Confidence",
            is_estimated: false,
            missing_inputs: [],
            affected_products: [],
            affected_suppliers: [],
            expected_result: "Lift throughput without additional ingredient spend.",
            potential_benefit_monthly: 1200,
            potential_benefit_annual: 14400,
            source_type: "production",
          })
        );
      }
    }

    const { data: docsNoPo } = await supabase
      .from("vyron_documents")
      .select("id, supplier_name, total, status, purchase_order_id")
      .eq("tenant_id", tenantId)
      .eq("status", "Approved")
      .is("purchase_order_id", null)
      .limit(30);
    if ((docsNoPo || []).length >= 3) {
      const exposure = (docsNoPo || []).reduce((s, d) => s + toNum(d.total), 0);
      rows.push(
        buildRec({
          recommendation_key: recKey("invoice-compliance", "batch"),
          category: "Duplicate Invoice Prevention",
          title: `${docsNoPo!.length} approved invoices without PO link`,
          summary: "Invoices approved without purchase order reference increase payment risk.",
          problem_statement: "Approved supplier invoices are not linked to open purchase orders.",
          cause_statement: "vyron_documents.purchase_order_id is null on approved invoices.",
          recommended_action: "Enforce PO linkage in Document Intelligence before invoice approval.",
          why_exists: `${docsNoPo!.length} approved documents missing PO reference.`,
          data_used: { invoiceCount: docsNoPo!.length, exposure, sourceTable: "vyron_documents" },
          formula_expression: "compliance_gap = count(invoices without PO)",
          confidence_score: 90,
          confidence_level: confidenceLevel(90),
          is_estimated: false,
          missing_inputs: [],
          affected_products: [],
          affected_suppliers: [],
          expected_result: "Strengthen 3-way match and prevent off-PO spend.",
          potential_benefit_monthly: exposure * 0.02,
          potential_benefit_annual: exposure * 0.24,
          source_type: "invoice",
        })
      );
    }
  }

  const recoveryRows = await importRecoveryOpportunitiesAsRecommendations(tenantId);
  rows.push(...recoveryRows);

  if (!rows.length && missingGlobal.length) {
    rows.push(
      buildRec({
        recommendation_key: "proc-ai-seed-assumption",
        category: "Margin Recovery",
        title: "Import supplier invoices to activate AI recommendations",
        summary: "No price movement data found for the current month.",
        recommended_action: "Upload and approve supplier invoices in Document Intelligence.",
        why_exists: "vyron_supplier_price_history returned zero rows for the current month.",
        data_used: { tenantId, periodFrom: monthStart },
        formula_expression: "N/A — awaiting data",
        confidence_score: 40,
        confidence_level: "Low Confidence",
        is_estimated: true,
        missing_inputs: ["Supplier price history", "Approved invoice extractions"],
        affected_products: [],
        affected_suppliers: [],
        expected_result: "Recommendations will populate from live costing and supplier data.",
        potential_benefit_monthly: 0,
        potential_benefit_annual: 0,
      })
    );
  }

  const deduped = new Map<string, GeneratedProcurementRecommendation>();
  for (const row of rows.map((r) => buildRec(r))) {
    const existing = deduped.get(row.recommendation_key);
    if (!existing || row.potential_benefit_annual > existing.potential_benefit_annual) {
      deduped.set(row.recommendation_key, row);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => b.potential_benefit_annual - a.potential_benefit_annual);
}

export async function importRecoveryOpportunitiesAsRecommendations(
  tenantId = DEMO_TENANT_ID
): Promise<GeneratedProcurementRecommendation[]> {
  const { getRecoveryOpportunities } = await import("@/lib/vyron-cost-recovery-data");
  const opportunities = await getRecoveryOpportunities();
  const out: GeneratedProcurementRecommendation[] = [];

  for (const opp of opportunities.filter(
    (o) => !["Recovered", "Rejected", "Ignored"].includes(o.tracking_status || o.status || "New")
  ).slice(0, 8)) {
    const annual = Number(opp.annual_value || (opp.monthly_value || 0) * 12);
    if (annual <= 0) continue;
    const key = recKey("recovery", String(opp.id || opp.title).slice(0, 40));
    out.push(
      buildRec({
        recommendation_key: key,
        category: "Margin Recovery",
        title: opp.title,
        summary: opp.description || "Recovery intelligence opportunity.",
        problem_statement: opp.title,
        cause_statement: opp.data_source || opp.formula || "Identified by recovery intelligence engine.",
        recommended_action: opp.recommended_action || "Review and action this recovery opportunity.",
        why_exists: `Recovery opportunity: ${opp.opportunity_type} with ${Number(opp.confidence || 0)}% confidence.`,
        data_used: {
          opportunityId: opp.id,
          opportunityType: opp.opportunity_type,
          monthlyValue: opp.monthly_value,
          source: "recovery_intelligence",
        },
        formula_expression: opp.formula || "annual = monthly_value × 12",
        confidence_score: Number(opp.confidence || 70),
        confidence_level: confidenceLevel(Number(opp.confidence || 70)),
        is_estimated: Boolean(opp.missing_inputs?.length),
        missing_inputs: opp.missing_inputs || [],
        affected_products: opp.product_name ? [{ productId: "", productName: opp.product_name }] : [],
        affected_suppliers: opp.supplier_name ? [{ supplierId: null, supplierName: opp.supplier_name }] : [],
        expected_result: `Potential recovery R${annual.toLocaleString("en-ZA")}/year.`,
        potential_benefit_monthly: annual / 12,
        potential_benefit_annual: annual,
        source_type: "recovery",
        source_recovery_key: String(opp.id || ""),
      })
    );
  }
  return out;
}

export async function computeProcurementHealthScore(
  tenantId = DEMO_TENANT_ID
): Promise<ProcurementHealthScore> {
  const [widgets, recoveryStats, productIntel] = await Promise.all([
    getSupplierPriceWidgetSummary(tenantId),
    getRecoveryTrackingExecutiveStats(),
    getProductIntelligence(),
  ]);

  const supabase = getSupabaseAdmin();
  let duplicateCount = 0;
  let avgInflationPct = 0;
  let poVarianceCount = 0;
  let invoicesWithoutPo = 0;
  let lowStockCount = 0;
  let overstockCount = 0;
  let avgYield = 100;

  if (supabase) {
    const monthStart = monthStartIso();
    const [
      { count: dupCount },
      { data: moves },
      { data: pos },
      { data: docs },
      { data: stock },
      { data: runs },
    ] = await Promise.all([
      supabase
        .from("vyron_procurement_risk_alerts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .ilike("risk_type", "%duplicate%"),
      supabase
        .from("vyron_supplier_price_history")
        .select("percentage_change")
        .eq("tenant_id", tenantId)
        .gte("created_at", monthStart)
        .limit(500),
      supabase
        .from("vyron_cost_purchase_orders")
        .select("variance")
        .eq("company_id", tenantId)
        .neq("status", "Cancelled"),
      supabase
        .from("vyron_documents")
        .select("id, purchase_order_id")
        .eq("tenant_id", tenantId)
        .eq("status", "Approved"),
      supabase.from("vyron_cost_stock_items").select("stock_status").eq("company_id", tenantId),
      supabase
        .from("vyron_cost_production_runs")
        .select("yield_pct")
        .eq("company_id", tenantId)
        .eq("status", "Completed")
        .gte("completed_at", monthStart)
        .limit(50),
    ]);
    duplicateCount = dupCount || 0;
    const pcts = ((moves || []) as Array<{ percentage_change: number | null }>)
      .map((r) => toNum(r.percentage_change))
      .filter((v) => v !== 0);
    avgInflationPct =
      pcts.length > 0 ? pcts.reduce((s, v) => s + Math.max(0, v), 0) / pcts.length : 0;
    poVarianceCount = (pos || []).filter((p) => Math.abs(toNum(p.variance)) > 0.01).length;
    invoicesWithoutPo = (docs || []).filter((d) => !d.purchase_order_id).length;
    lowStockCount = (stock || []).filter((s) => s.stock_status === "Low Stock" || s.stock_status === "Out Of Stock").length;
    overstockCount = (stock || []).filter((s) => s.stock_status === "Overstock" || s.stock_status === "Slow Moving").length;
    const yields = (runs || []).map((r) => toNum(r.yield_pct)).filter((y) => y > 0);
    avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : 100;
  }

  const totalMoves = widgets.increasesThisMonth + widgets.decreasesThisMonth;
  const increaseRatio = totalMoves > 0 ? widgets.increasesThisMonth / totalMoves : 0.5;
  const priceStability = Math.round(Math.max(0, 100 - increaseRatio * 55 - avgInflationPct * 2));

  const topSupplierChanges = widgets.suppliersWithMostChanges[0]?.changes || 0;
  const supplierRisk = Math.round(Math.max(0, 100 - topSupplierChanges * 8 - avgInflationPct * 1.5));

  const recoveryPerformance = Math.round(
    Math.min(100, Math.max(20, recoveryStats.recoverySuccessPct || 0))
  );

  const inventoryHealth = Math.round(Math.max(0, 100 - lowStockCount * 5 - overstockCount * 4));

  const poCompliance = Math.round(Math.max(0, 100 - poVarianceCount * 6));

  const invoiceCompliance = Math.round(Math.max(0, 100 - invoicesWithoutPo * 4 - duplicateCount * 12));

  const productionEfficiency = Math.round(Math.min(100, Math.max(0, avgYield)));

  const duplicateInvoices = Math.round(Math.max(0, 100 - duplicateCount * 18));
  const belowTarget = productIntel.filter((p) => toNum(p.gp_gap) > 0).length;
  const marginTrends = Math.round(
    Math.max(0, 100 - (belowTarget / Math.max(1, productIntel.length)) * 100)
  );
  const costInflation = Math.round(Math.max(0, 100 - avgInflationPct * 3));

  const components = [
    supplierRisk,
    priceStability,
    inventoryHealth,
    recoveryPerformance,
    poCompliance,
    invoiceCompliance,
    productionEfficiency,
  ];
  const overall = Math.round(components.reduce((s, v) => s + v, 0) / components.length);

  const notes: string[] = [];
  if (widgets.increasesThisMonth > widgets.decreasesThisMonth) {
    notes.push(`${widgets.increasesThisMonth} price increases vs ${widgets.decreasesThisMonth} decreases this month.`);
  }
  if (duplicateCount > 0) notes.push(`${duplicateCount} open duplicate-invoice risk alert(s).`);
  if (belowTarget > 0) notes.push(`${belowTarget} product(s) below target GP.`);
  if (poVarianceCount > 0) notes.push(`${poVarianceCount} PO(s) with cost variance.`);
  if (avgYield < 95) notes.push(`Average production yield ${avgYield.toFixed(1)}% this month.`);

  return {
    overall,
    supplierRisk,
    priceStability,
    inventoryHealth,
    recoveryPerformance,
    poCompliance,
    invoiceCompliance,
    productionEfficiency,
    supplierConcentration: supplierRisk,
    duplicateInvoices,
    marginTrends,
    costInflation,
    notes,
  };
}

export async function recomputeProcurementRecommendations(
  tenantId = DEMO_TENANT_ID
): Promise<GeneratedProcurementRecommendation[]> {
  const supabase = getSupabaseAdmin();
  const generated = await generateProcurementRecommendations(tenantId);
  if (!supabase || !generated.length) return generated;

  const payload = generated.map((row) => ({
    tenant_id: tenantId,
    recommendation_key: row.recommendation_key,
    category: row.category,
    title: row.title,
    summary: row.summary,
    problem_statement: row.problem_statement,
    cause_statement: row.cause_statement,
    recommended_action: row.recommended_action,
    why_exists: row.why_exists,
    data_used: row.data_used,
    formula_expression: row.formula_expression,
    confidence_score: row.confidence_score,
    confidence_level: row.confidence_level,
    is_estimated: row.is_estimated,
    missing_inputs: row.missing_inputs,
    affected_products: row.affected_products,
    affected_suppliers: row.affected_suppliers,
    expected_result: row.expected_result,
    potential_benefit_monthly: row.potential_benefit_monthly,
    potential_benefit_annual: row.potential_benefit_annual,
    expected_gp_improvement_pct: row.expected_gp_improvement_pct ?? null,
    selling_price_adjustment: row.selling_price_adjustment ?? null,
    source_type: row.source_type ?? null,
    source_recovery_key: row.source_recovery_key ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("vyron_procurement_recommendations")
    .upsert(payload, { onConflict: "tenant_id,recommendation_key" });

  if (error) throw error;
  return generated;
}
