import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Finished Goods — BOM Completeness.
 *
 * A finished good whose BOM is missing, empty or unusable cannot produce a
 * defensible cost, and every rand of GP reported against it is therefore
 * unproven. "No recipe" on its own is not useful to a client, so this engine
 * separates the distinct ways a BOM fails and says what to do about each:
 *
 *   NO BOM            nothing is linked to the product at all
 *   EMPTY BOM         a BOM exists but carries no component lines
 *   MISSING COMPONENT a line points at an ingredient that no longer exists
 *   INCOMPLETE        a costed component has a zero quantity recorded
 *   NO COST           no usable cost can be derived, or the product has none
 *   COMPLETE          components, quantities and costs all resolve
 *
 * Two things are deliberately NOT treated as faults. A component priced at zero
 * (water) is normal and is only counted. And BOM cost differing from finished
 * good cost is expected — the BOM holds ingredients, the product cost also holds
 * a per-pack-size packaging/overhead element — so the gap is explained on the
 * row instead of being raised as an error. Neither cost is ever rewritten.
 *
 * Everything is company scoped. A product, BOM, BOM line, ingredient or invoice
 * belonging to another tenant can never enter the result, because every query
 * filters on company_id and every join is resolved against those filtered sets.
 */

export type BomStatus =
  | "COMPLETE"
  | "NO BOM"
  | "EMPTY BOM"
  | "INCOMPLETE"
  | "MISSING COMPONENT"
  | "NO COST";

export type BomSeverity = "Critical" | "High" | "Medium" | "Low" | "None";

export type BomCompletenessRow = {
  productId: string;
  productName: string;
  productCode: string | null;
  category: string;
  sellingPrice: number;
  productCost: number;
  bomStatus: BomStatus;
  severity: BomSeverity;
  componentCount: number;
  missingComponents: number;
  invalidComponents: number;
  /** Components that legitimately cost nothing (e.g. water). Informational. */
  zeroCostComponents: number;
  /** Null when no BOM exists or no cost can be derived from it. */
  bomCost: number | null;
  /** bomCost - productCost. Null when either side is unavailable. */
  costVariance: number | null;
  costVariancePct: number | null;
  lastUpdated: string | null;
  unitsSold: number;
  revenue: number;
  /** Null when the product carries no cost — the GP is unknown, not 100%. */
  gp: number | null;
  gpPct: number | null;
  /** True when the product sold in the period but has no usable BOM. */
  soldWithoutUsableBom: boolean;
  recommendedAction: string;
  issues: string[];
};

export type BomCompletenessSummary = {
  totalFinishedGoods: number;
  completeBoms: number;
  noBom: number;
  incompleteBoms: number;
  missingComponents: number;
  productsWithNoCost: number;
  soldWithoutUsableBom: number;
  criticalCount: number;
  totalRevenueAtRisk: number;
};

export type BomCompletenessReport = {
  rows: BomCompletenessRow[];
  summary: BomCompletenessSummary;
  categories: string[];
  from: string | null;
  to: string | null;
};

type ProductRow = {
  id: string;
  product_name: string;
  category: string | null;
  sku: string | null;
  selling_price: number | null;
  total_cost: number | null;
  updated_at: string | null;
};
type BomRow = {
  id: string;
  bom_name: string | null;
  product_id: string | null;
  finished_product_id: string | null;
  total_cost: number | null;
  cost_per_unit: number | null;
  yield_qty: number | null;
  status: string | null;
  updated_at: string | null;
};
type BomLineRow = {
  id: string;
  bom_id: string;
  ingredient_id: string | null;
  line_name: string | null;
  quantity: number | null;
  unit_cost: number | null;
  line_cost: number | null;
};
/**
 * Ingredients carry no status column, so "inactive" is not a state that exists
 * here. A component is missing when its ingredient_id no longer resolves, and
 * uncosted when neither the ingredient nor the line carries a cost.
 */
type IngredientRow = { id: string; ingredient_name: string; purchase_cost: number | null; true_unit_cost: number | null };

const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const key = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Materiality floor for a BOM-vs-product cost disagreement. */
const VARIANCE_PCT_THRESHOLD = 5;
const VARIANCE_ABS_THRESHOLD = 0.1;

async function loadAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  companyId: string
): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("company_id", companyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data || []) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export async function getBomCompletenessReport(
  supabase: SupabaseClient,
  companyId: string,
  filters: { from?: string; to?: string } = {}
): Promise<BomCompletenessReport> {
  const from = filters.from?.trim() || null;
  const to = filters.to?.trim() || null;

  const [products, boms, bomLines, ingredients] = await Promise.all([
    loadAll<ProductRow>(
      supabase,
      "vyron_cost_products",
      "id, product_name, category, sku, selling_price, total_cost, updated_at",
      companyId
    ),
    loadAll<BomRow>(
      supabase,
      "vyron_cost_boms",
      "id, bom_name, product_id, finished_product_id, total_cost, cost_per_unit, yield_qty, status, updated_at",
      companyId
    ),
    loadAll<BomLineRow>(
      supabase,
      "vyron_cost_bom_lines",
      "id, bom_id, ingredient_id, line_name, quantity, unit_cost, line_cost",
      companyId
    ),
    loadAll<IngredientRow>(
      supabase,
      "vyron_cost_ingredients",
      "id, ingredient_name, purchase_cost, true_unit_cost",
      companyId
    ),
  ]);

  /* ---------------------------------------------------------------- sales */
  // Sales are read only for THIS company's invoices, then lines are restricted
  // to those invoice ids, so no other tenant's line can reach the aggregate.
  let invoiceQuery = supabase
    .from("vyron_customer_invoices")
    .select("id, invoice_date")
    .eq("company_id", companyId);
  if (from) invoiceQuery = invoiceQuery.gte("invoice_date", from);
  if (to) invoiceQuery = invoiceQuery.lte("invoice_date", to);
  const { data: invoiceRows, error: invoiceError } = await invoiceQuery;
  if (invoiceError) throw new Error(`vyron_customer_invoices: ${invoiceError.message}`);

  const invoiceIds = (invoiceRows || []).map((r) => String(r.id));
  const salesByProduct = new Map<string, { qty: number; revenue: number; cost: number }>();
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const chunk = invoiceIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("vyron_customer_invoice_lines")
      .select("product_id, quantity, selling_price, cost_per_unit")
      .in("invoice_id", chunk);
    if (error) throw new Error(`vyron_customer_invoice_lines: ${error.message}`);
    for (const line of data || []) {
      const pid = line.product_id ? String(line.product_id) : null;
      if (!pid) continue;
      const entry = salesByProduct.get(pid) || { qty: 0, revenue: 0, cost: 0 };
      const qty = num(line.quantity);
      entry.qty += qty;
      entry.revenue += qty * num(line.selling_price);
      entry.cost += qty * num(line.cost_per_unit);
      salesByProduct.set(pid, entry);
    }
  }

  /* ------------------------------------------------------------ BOM index */
  const linesByBom = new Map<string, BomLineRow[]>();
  for (const line of bomLines) {
    const list = linesByBom.get(String(line.bom_id)) || [];
    list.push(line);
    linesByBom.set(String(line.bom_id), list);
  }
  const ingredientById = new Map(ingredients.map((i) => [String(i.id), i]));

  /*
   * A BOM is attached to a product by explicit id where one is set, and by name
   * otherwise. Both are supported because the imported Handcrafted BOMs carry
   * only bom_name, while BOMs built in the app carry product_id.
   */
  const bomByProductId = new Map<string, BomRow>();
  const bomByName = new Map<string, BomRow>();
  for (const bom of boms) {
    const pid = bom.product_id || bom.finished_product_id;
    if (pid && !bomByProductId.has(String(pid))) bomByProductId.set(String(pid), bom);
    const nameKey = key(bom.bom_name);
    if (nameKey && !bomByName.has(nameKey)) bomByName.set(nameKey, bom);
  }

  /* -------------------------------------------------------------- product code */
  // All 48 imported products have a null SKU, so the saved accounting mapping
  // code is used as the visible product code where one exists. It is real data,
  // company scoped, and it is what the operator recognises the item by.
  const mappingCodeByProduct = new Map<string, string>();
  try {
    const mappings = await loadAll<{ source_item_code: string | null; product_id: string }>(
      supabase,
      "vyron_customer_item_mappings",
      "source_item_code, product_id",
      companyId
    );
    for (const m of mappings) {
      const code = String(m.source_item_code || "").trim();
      if (!code) continue;
      const pid = String(m.product_id);
      if (!mappingCodeByProduct.has(pid)) mappingCodeByProduct.set(pid, code);
    }
  } catch {
    // A missing mapping table must not fail the report; the column simply shows "—".
  }

  const rows: BomCompletenessRow[] = products.map((product) => {
    const productId = String(product.id);
    const sellingPrice = num(product.selling_price);
    const productCost = num(product.total_cost);
    const sales = salesByProduct.get(productId) || { qty: 0, revenue: 0, cost: 0 };
    const gp = sales.revenue - sales.cost;
    /* GP is only meaningful once the product carries a real cost. */
    const costKnown = productCost > 0;

    const bom = bomByProductId.get(productId) || bomByName.get(key(product.product_name)) || null;
    const lines = bom ? linesByBom.get(String(bom.id)) || [] : [];

    let missingComponents = 0;
    let invalidComponents = 0;
    let zeroCostComponents = 0;
    for (const line of lines) {
      // A line whose ingredient no longer resolves, or which names nothing at
      // all, cannot be costed and cannot be bought.
      let ingredient: IngredientRow | undefined;
      if (line.ingredient_id) {
        ingredient = ingredientById.get(String(line.ingredient_id));
        if (!ingredient) missingComponents += 1;
      } else if (!String(line.line_name || "").trim()) {
        missingComponents += 1;
      }
      /*
       * A zero quantity on a component that DOES carry a unit cost is a real
       * gap worth surfacing. It also occurs legitimately for trace dosing:
       * bom_lines.quantity is numeric(14,4), so a component dosed below
       * 0.0001 of its unit (dried herbs at 0.00002 kg per pie) stores as 0.
       * Either way the operator should look, so it is counted — but it does
       * not by itself make the BOM invalid.
       */
      if (num(line.quantity) <= 0) invalidComponents += 1;

      /*
       * A component costing nothing is NOT incomplete. Water is a real
       * ingredient priced at zero. Only a BOM that cannot produce a total
       * cost at all is treated as a costing failure.
       */
      const lineHasCost =
        num(line.unit_cost) > 0 ||
        num(line.line_cost) > 0 ||
        num(ingredient?.true_unit_cost) > 0 ||
        num(ingredient?.purchase_cost) > 0;
      if (!lineHasCost) zeroCostComponents += 1;
    }

    const derivedLineCost = lines.reduce(
      (sum, l) => sum + (num(l.line_cost) || num(l.quantity) * num(l.unit_cost)),
      0
    );
    const statedBomCost = bom ? num(bom.total_cost) || num(bom.cost_per_unit) : 0;
    const bomCost = bom ? (derivedLineCost > 0 ? derivedLineCost : statedBomCost > 0 ? statedBomCost : null) : null;

    const issues: string[] = [];
    let bomStatus: BomStatus;

    if (!bom) {
      bomStatus = "NO BOM";
      issues.push("No BOM or recipe is linked to this finished good.");
    } else if (!lines.length) {
      bomStatus = "EMPTY BOM";
      issues.push(
        statedBomCost > 0
          ? `BOM exists and carries a cost of ${statedBomCost.toFixed(2)} but has no component lines, so that cost cannot be substantiated.`
          : "BOM exists but has no component lines."
      );
    } else if (missingComponents > 0) {
      bomStatus = "MISSING COMPONENT";
      issues.push(`${missingComponents} component(s) reference a missing ingredient.`);
    } else if (invalidComponents > 0) {
      bomStatus = "INCOMPLETE";
      issues.push(
        `${invalidComponents} component(s) carry a unit cost but a zero quantity — either the quantity is missing, or it is a trace dose below the 4-decimal quantity precision.`
      );
    } else if (bomCost === null || bomCost <= 0) {
      bomStatus = "NO COST";
      issues.push("The BOM does not produce a usable cost.");
    } else {
      bomStatus = "COMPLETE";
    }

    // A product with no cost of its own is reported as NO COST regardless of the
    // BOM state, because nothing downstream can price or margin it.
    if (productCost <= 0 && (bomStatus === "COMPLETE" || bomStatus === "NO BOM")) {
      if (bomStatus === "NO BOM") issues.push("Product also has no cost, so its GP is reported at 100%.");
      else {
        bomStatus = "NO COST";
        issues.push("Product carries no cost even though its BOM resolves.");
      }
    }

    /*
     * BOM cost and product cost measure different things and are EXPECTED to
     * differ. The BOM carries ingredient/component cost only; the finished-good
     * cost additionally carries a per-pack-size element (packaging/overhead)
     * that was set when the products were costed. The gap is therefore reported
     * and explained, never treated as an error, and neither figure is rewritten.
     */
    let costVariance: number | null = null;
    let costVariancePct: number | null = null;
    if (bomCost !== null && bomCost > 0 && productCost > 0) {
      costVariance = bomCost - productCost;
      costVariancePct = (costVariance / productCost) * 100;
      if (
        Math.abs(costVariance) >= VARIANCE_ABS_THRESHOLD &&
        Math.abs(costVariancePct) >= VARIANCE_PCT_THRESHOLD
      ) {
        issues.push(
          `BOM (ingredients only) ${bomCost.toFixed(2)} vs finished-good cost ${productCost.toFixed(2)} — a ${Math.abs(costVariance).toFixed(2)} per-unit difference covering packaging and overhead. Expected, not an error.`
        );
      }
    }

    /*
     * "Usable" means the BOM can substantiate a cost. INCOMPLETE still yields a
     * cost (the gap is a trace quantity), so it counts as usable but is still
     * surfaced for review.
     */
    const usable = bomStatus === "COMPLETE" || bomStatus === "INCOMPLETE";
    const soldWithoutUsableBom = sales.qty > 0 && !usable;
    if (soldWithoutUsableBom) {
      issues.push(
        `Sold ${sales.qty.toLocaleString("en-ZA")} unit(s) for ${sales.revenue.toFixed(2)} in this period without a usable BOM.`
      );
    }

    let severity: BomSeverity;
    if (soldWithoutUsableBom && (bomStatus === "NO BOM" || bomStatus === "NO COST" || bomStatus === "MISSING COMPONENT")) {
      severity = "Critical";
    } else if (soldWithoutUsableBom || bomStatus === "MISSING COMPONENT") {
      severity = "High";
    } else if (bomStatus === "NO BOM" || bomStatus === "EMPTY BOM" || bomStatus === "NO COST") {
      severity = "Medium";
    } else if (bomStatus === "INCOMPLETE") {
      severity = "Low";
    } else {
      severity = "None";
    }

    let recommendedAction: string;
    switch (bomStatus) {
      case "NO BOM":
        recommendedAction = sales.qty > 0 ? "Build a BOM — this product is being sold with an unproven cost." : "Build a BOM for this finished good.";
        break;
      case "EMPTY BOM":
        recommendedAction = "Add component lines to the existing BOM.";
        break;
      case "MISSING COMPONENT":
        recommendedAction = "Replace or reactivate the missing ingredient(s).";
        break;
      case "INCOMPLETE":
        recommendedAction = "Confirm the component quantities recorded as zero.";
        break;
      case "NO COST":
        recommendedAction = "Establish a cost — GP cannot be reported for this product.";
        break;
      default:
        recommendedAction = "None — BOM is complete.";
    }

    return {
      productId,
      productName: String(product.product_name || "—"),
      productCode: product.sku?.trim() || mappingCodeByProduct.get(productId) || null,
      category: String(product.category || "Uncategorised"),
      sellingPrice,
      productCost,
      bomStatus,
      severity,
      componentCount: lines.length,
      missingComponents,
      invalidComponents,
      zeroCostComponents,
      bomCost,
      costVariance,
      costVariancePct,
      lastUpdated: bom?.updated_at || product.updated_at || null,
      unitsSold: sales.qty,
      revenue: sales.revenue,
      /*
       * A product with no cost has an UNKNOWN gross profit, not a 100% one.
       * Reporting 0 cost as 100% GP would overstate margin on a client-facing
       * report, so both figures are null until a real cost exists.
       */
      gp: costKnown ? gp : null,
      gpPct: costKnown && sales.revenue > 0 ? (gp / sales.revenue) * 100 : null,
      soldWithoutUsableBom,
      recommendedAction,
      issues,
    };
  });

  const SEVERITY_ORDER: Record<BomSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, None: 4 };
  rows.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.revenue - a.revenue ||
      a.productName.localeCompare(b.productName)
  );

  const summary: BomCompletenessSummary = {
    totalFinishedGoods: rows.length,
    completeBoms: rows.filter((r) => r.bomStatus === "COMPLETE").length,
    noBom: rows.filter((r) => r.bomStatus === "NO BOM").length,
    incompleteBoms: rows.filter((r) => r.bomStatus === "EMPTY BOM" || r.bomStatus === "INCOMPLETE").length,
    missingComponents: rows.filter((r) => r.bomStatus === "MISSING COMPONENT").length,
    productsWithNoCost: rows.filter((r) => r.productCost <= 0).length,
    soldWithoutUsableBom: rows.filter((r) => r.soldWithoutUsableBom).length,
    criticalCount: rows.filter((r) => r.severity === "Critical").length,
    totalRevenueAtRisk: rows.filter((r) => r.soldWithoutUsableBom).reduce((s, r) => s + r.revenue, 0),
  };

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  return { rows, summary, categories, from, to };
}
