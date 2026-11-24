import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Finished Goods — BOM Completeness.
 *
 * A finished good whose BOM is missing, empty or unusable cannot produce a
 * defensible cost, and every rand of GP reported against it is therefore
 * unproven. "No recipe" on its own is not useful to a client, so this engine
 * separates the distinct ways a BOM fails and says what to do about each:
 *
 *   NO BOM            nothing usable is linked to the product
 *   EMPTY BOM         a BOM exists but carries no component lines
 *   MISSING COMPONENT a line points at an ingredient record that was deleted
 *   INCOMPLETE        a component has a zero quantity recorded
 *   NO COST           no usable cost can be derived, or the product has none
 *   COMPLETE          components, quantities and costs all resolve
 *
 * POPULATION. Only finished goods that are in use are assessed. Archived
 * products (status / product_status "Archived") are excluded from every count
 * and from Revenue at Risk, and disclosed in the summary instead. BOMs marked
 * Sub-BOM are never treated as a finished good's BOM, and an Archived BOM never
 * stands as a product's current BOM.
 *
 * USABLE. A BOM is usable when it substantiates a cost. A line whose ingredient
 * record was deleted still carries its own quantity and unit cost, so the BOM
 * still costs; it is surfaced as MISSING COMPONENT (High — the line can no
 * longer be repriced or deducted from stock) but it is NOT counted as "sold
 * without a usable BOM" and its revenue is NOT at risk. Only a missing line
 * that carries no cost makes the BOM unusable.
 *
 * PRIORITY.
 *   Critical  sold in the period and no usable BOM (no substantiated cost)
 *   High      MISSING COMPONENT (master-data break, cost still substantiated)
 *   Medium    NO BOM / EMPTY BOM / NO COST with no sales in the period
 *   Low       INCOMPLETE (zero quantity recorded on a component)
 *   None      COMPLETE, sold or not
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
 * Every read is paginated with a stable order: PostgREST caps a response at
 * 1,000 rows, and an unpaginated read silently drops whatever lies beyond it.
 */

export type BomStatus =
  | "COMPLETE"
  | "NO BOM"
  | "EMPTY BOM"
  | "INCOMPLETE"
  | "MISSING COMPONENT"
  | "NO COST";

export type BomSeverity = "Critical" | "High" | "Medium" | "Low" | "None";

/** How the BOM shown on a row was attached to its product. */
export type BomLink = "product" | "linked" | "name" | null;

export type BomCompletenessRow = {
  productId: string;
  productName: string;
  productCode: string | null;
  category: string;
  sellingPrice: number;
  productCost: number;
  bomId: string | null;
  bomName: string | null;
  /** The BOM record's own status (Approved, Draft …). */
  bomRecordStatus: string | null;
  bomLink: BomLink;
  bomStatus: BomStatus;
  severity: BomSeverity;
  componentCount: number;
  /** Lines whose ingredient record no longer exists (or which name nothing). */
  missingComponents: number;
  /** Of missingComponents, those that carry no cost of their own. */
  missingUncostedComponents: number;
  /** Lines recorded with a zero quantity. */
  invalidComponents: number;
  /** Text-only lines that were never linked to an ingredient record. Informational. */
  unlinkedComponents: number;
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
  /** True when the BOM substantiates a cost. */
  usableBom: boolean;
  /** True when the product sold in the period but has no usable BOM. */
  soldWithoutUsableBom: boolean;
  recommendedAction: string;
  issues: string[];
};

export type BomCompletenessSummary = {
  totalFinishedGoods: number;
  completeBoms: number;
  noBom: number;
  /** EMPTY BOM + INCOMPLETE. */
  incompleteBoms: number;
  missingComponents: number;
  productsWithNoCost: number;
  soldWithoutUsableBom: number;
  criticalCount: number;
  totalRevenueAtRisk: number;
  /** Archived products left out of every figure above. */
  archivedExcluded: number;
  /** Their sales in the period, disclosed rather than counted. */
  archivedRevenue: number;
  /** Invoice lines in the period that carry no product, so belong to no row. */
  unattributedLines: number;
  unattributedRevenue: number;
};

export type BomCompletenessReport = {
  rows: BomCompletenessRow[];
  summary: BomCompletenessSummary;
  categories: string[];
  from: string | null;
  to: string | null;
};

export type ProductRow = {
  id: string;
  product_name: string;
  category: string | null;
  sku: string | null;
  selling_price: number | null;
  total_cost: number | null;
  updated_at: string | null;
  status?: string | null;
  product_status?: string | null;
  linked_bom_id?: string | null;
};
export type BomRow = {
  id: string;
  bom_name: string | null;
  product_id: string | null;
  finished_product_id: string | null;
  total_cost: number | null;
  cost_per_unit: number | null;
  yield_qty: number | null;
  status: string | null;
  bom_purpose?: string | null;
  updated_at: string | null;
};
export type BomLineRow = {
  id: string;
  bom_id: string;
  ingredient_id: string | null;
  child_bom_id?: string | null;
  line_name: string | null;
  quantity: number | null;
  unit_cost: number | null;
  line_cost: number | null;
};
/**
 * Ingredients carry no status column, so "inactive" is not a state that exists
 * here. A component is missing when its ingredient_id no longer resolves.
 */
export type IngredientRow = { id: string; ingredient_name: string; purchase_cost: number | null; true_unit_cost: number | null };

/** One invoice line already reduced to what this report needs. */
export type SalesLine = { productId: string | null; quantity: number; revenue: number; cost: number };

export type BomCompletenessInput = {
  products: ProductRow[];
  boms: BomRow[];
  bomLines: BomLineRow[];
  ingredients: IngredientRow[];
  sales: SalesLine[];
  productCodes?: Map<string, string>;
  from?: string | null;
  to?: string | null;
};

const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const key = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Materiality floor for a BOM-vs-product cost disagreement. */
const VARIANCE_PCT_THRESHOLD = 5;
const VARIANCE_ABS_THRESHOLD = 0.1;

const INACTIVE_PRODUCT = new Set(["archived", "inactive", "discontinued", "deleted"]);
export const isArchivedProduct = (p: Pick<ProductRow, "status" | "product_status">) =>
  INACTIVE_PRODUCT.has(key(p.status)) || INACTIVE_PRODUCT.has(key(p.product_status));
const isArchivedBom = (b: BomRow) => key(b.status) === "archived";
const isSubBom = (b: BomRow) => key(b.bom_purpose) === "sub-bom";
/** Approved/active BOMs rank ahead of drafts; newest wins a tie. */
const bomRank = (b: BomRow) => (["approved", "active"].includes(key(b.status)) ? 0 : 1);
const pickBest = (list: BomRow[]) =>
  [...list].sort(
    (a, b) => bomRank(a) - bomRank(b) || String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  )[0] ?? null;

/** Invoice statuses that are not sales. */
const NON_SALE_INVOICE = new Set(["draft", "cancelled", "canceled", "void", "voided"]);
export const isSaleInvoice = (status: unknown) => !NON_SALE_INVOICE.has(key(status));

/**
 * Revenue of one invoice line, excluding VAT and net of discount. taxable_amount
 * is exactly that where the tax engine has written it; older lines fall back to
 * quantity x price less the line discount.
 */
export function invoiceLineRevenue(line: {
  quantity?: unknown;
  selling_price?: unknown;
  taxable_amount?: unknown;
  discount_amount?: unknown;
}) {
  if (line.taxable_amount !== null && line.taxable_amount !== undefined && line.taxable_amount !== "") {
    return num(line.taxable_amount);
  }
  return num(line.quantity) * num(line.selling_price) - num(line.discount_amount);
}

/** Pure computation — every figure on the report comes from here. */
export function buildBomCompletenessReport(input: BomCompletenessInput): BomCompletenessReport {
  const from = input.from ?? null;
  const to = input.to ?? null;
  const { products, boms, bomLines, ingredients } = input;
  const productCodes = input.productCodes ?? new Map<string, string>();

  const productById = new Map(products.map((p) => [String(p.id), p]));
  const salesByProduct = new Map<string, { qty: number; revenue: number; cost: number }>();
  let unattributedLines = 0;
  let unattributedRevenue = 0;
  for (const line of input.sales) {
    if (!line.productId) {
      unattributedLines += 1;
      unattributedRevenue += line.revenue;
      continue;
    }
    const entry = salesByProduct.get(line.productId) || { qty: 0, revenue: 0, cost: 0 };
    entry.qty += line.quantity;
    entry.revenue += line.revenue;
    entry.cost += line.cost;
    salesByProduct.set(line.productId, entry);
  }

  /* ------------------------------------------------------------ BOM index */
  const linesByBom = new Map<string, BomLineRow[]>();
  for (const line of bomLines) {
    const list = linesByBom.get(String(line.bom_id)) || [];
    list.push(line);
    linesByBom.set(String(line.bom_id), list);
  }
  const ingredientById = new Map(ingredients.map((i) => [String(i.id), i]));
  const bomById = new Map(boms.map((b) => [String(b.id), b]));

  const bomsByProductId = new Map<string, BomRow[]>();
  const bomsByName = new Map<string, BomRow[]>();
  for (const bom of boms) {
    if (isSubBom(bom)) continue;
    const pid = bom.product_id || bom.finished_product_id;
    if (pid) {
      const list = bomsByProductId.get(String(pid)) || [];
      list.push(bom);
      bomsByProductId.set(String(pid), list);
    }
    const nameKey = key(bom.bom_name);
    if (nameKey) {
      const list = bomsByName.get(nameKey) || [];
      list.push(bom);
      bomsByName.set(nameKey, list);
    }
  }
  const ownerOf = (bom: BomRow) => {
    const pid = bom.product_id || bom.finished_product_id;
    return pid ? productById.get(String(pid)) ?? null : null;
  };
  /**
   * A BOM explicitly owned by a different, in-use product, and named for
   * neither this product, is not this product's BOM — accepting it would cost
   * one product from another product's recipe (Curry Vegetable Pie linked to
   * the Beef Curry Pie BOM). A BOM that carries THIS product's name is still
   * accepted; the shared-BOM note on both rows surfaces the conflict.
   */
  const ownedByAnotherActive = (bom: BomRow, product: ProductRow) => {
    const owner = ownerOf(bom);
    return (
      !!owner &&
      String(owner.id) !== String(product.id) &&
      !isArchivedProduct(owner) &&
      key(owner.product_name) !== key(product.product_name) &&
      key(bom.bom_name) !== key(product.product_name)
    );
  };

  const active = products.filter((p) => !isArchivedProduct(p));
  const archived = products.filter((p) => isArchivedProduct(p));

  /* Resolve every product's BOM first so a BOM shared by several products can be named. */
  const resolved = new Map<string, { bom: BomRow | null; link: BomLink; notes: string[] }>();
  for (const product of active) {
    const pid = String(product.id);
    const notes: string[] = [];
    let bom: BomRow | null = null;
    let link: BomLink = null;

    const own = bomsByProductId.get(pid) || [];
    bom = pickBest(own.filter((b) => !isArchivedBom(b)));
    if (bom) link = "product";
    else if (own.length) {
      notes.push(`Only archived BOM(s) are linked to this product (${own.map((b) => b.bom_name || b.id).join(", ")}).`);
    }

    if (!bom && product.linked_bom_id) {
      const linked = bomById.get(String(product.linked_bom_id));
      if (!linked) {
        notes.push("The product's linked BOM no longer exists.");
      } else if (isSubBom(linked) || isArchivedBom(linked)) {
        notes.push(`The product is linked to "${linked.bom_name}", which is ${isSubBom(linked) ? "a Sub-BOM" : "archived"}.`);
      } else if (ownedByAnotherActive(linked, product)) {
        notes.push(
          `The product is linked to "${linked.bom_name}", which is the BOM of another finished good (${ownerOf(linked)?.product_name}). That link is not accepted.`
        );
      } else {
        bom = linked;
        link = "linked";
      }
    }

    if (!bom) {
      const byName = (bomsByName.get(key(product.product_name)) || []).filter(
        (b) => !isArchivedBom(b) && !ownedByAnotherActive(b, product)
      );
      bom = pickBest(byName);
      if (bom) link = "name";
    }
    resolved.set(pid, { bom, link, notes });
  }
  const usersOfBom = new Map<string, string[]>();
  for (const product of active) {
    const r = resolved.get(String(product.id));
    if (!r?.bom) continue;
    const list = usersOfBom.get(String(r.bom.id)) || [];
    list.push(String(product.id));
    usersOfBom.set(String(r.bom.id), list);
  }

  const rows: BomCompletenessRow[] = active.map((product) => {
    const productId = String(product.id);
    const sellingPrice = num(product.selling_price);
    const productCost = num(product.total_cost);
    const sales = salesByProduct.get(productId) || { qty: 0, revenue: 0, cost: 0 };
    const gp = sales.revenue - sales.cost;
    /* GP is only meaningful once the product carries a real cost. */
    const costKnown = productCost > 0;

    const { bom, link, notes } = resolved.get(productId)!;
    const lines = bom ? linesByBom.get(String(bom.id)) || [] : [];
    const issues: string[] = [...notes];

    let missingComponents = 0;
    let missingUncostedComponents = 0;
    let invalidComponents = 0;
    let unlinkedComponents = 0;
    let zeroCostComponents = 0;
    const missingNames: string[] = [];
    for (const line of lines) {
      const lineOwnCost = num(line.unit_cost) > 0 || num(line.line_cost) > 0;
      let ingredient: IngredientRow | undefined;
      let missing = false;
      if (line.ingredient_id) {
        ingredient = ingredientById.get(String(line.ingredient_id));
        missing = !ingredient;
      } else if (line.child_bom_id) {
        missing = !bomById.has(String(line.child_bom_id));
      } else if (!String(line.line_name || "").trim()) {
        missing = true;
      } else {
        unlinkedComponents += 1;
      }
      if (missing) {
        missingComponents += 1;
        missingNames.push(String(line.line_name || "unnamed line"));
        if (!lineOwnCost) missingUncostedComponents += 1;
      }
      /*
       * A zero quantity is counted for review. It also occurs legitimately for
       * trace dosing below the column precision, so it does not by itself make
       * the BOM unusable.
       */
      if (num(line.quantity) <= 0) invalidComponents += 1;

      /* A component costing nothing (water) is NOT incomplete — only counted. */
      const lineHasCost = lineOwnCost || num(ingredient?.true_unit_cost) > 0 || num(ingredient?.purchase_cost) > 0;
      if (!lineHasCost) zeroCostComponents += 1;
    }

    const derivedLineCost = lines.reduce(
      (sum, l) => sum + (num(l.line_cost) || num(l.quantity) * num(l.unit_cost)),
      0
    );
    const statedBomCost = bom ? num(bom.total_cost) || num(bom.cost_per_unit) : 0;
    const bomCost = bom ? (derivedLineCost > 0 ? derivedLineCost : statedBomCost > 0 ? statedBomCost : null) : null;

    let bomStatus: BomStatus;
    if (!bom) {
      bomStatus = "NO BOM";
      if (!notes.length) issues.push("No BOM or recipe is linked to this finished good.");
    } else if (!lines.length) {
      bomStatus = "EMPTY BOM";
      issues.push(
        statedBomCost > 0
          ? `BOM "${bom.bom_name}" (${bom.status || "no status"}) carries a cost of ${statedBomCost.toFixed(2)} but has no component lines, so that cost cannot be substantiated.`
          : `BOM "${bom.bom_name}" (${bom.status || "no status"}) has no component lines.`
      );
    } else if (missingComponents > 0) {
      bomStatus = "MISSING COMPONENT";
      issues.push(
        `${missingComponents} component(s) reference a deleted ingredient record: ${missingNames.join(", ")}.` +
          (missingUncostedComponents
            ? ` ${missingUncostedComponents} of them carry no cost, so the BOM cannot substantiate a cost.`
            : " Each line still carries its own quantity and unit cost, so the BOM cost stands — but the line can no longer be repriced or deducted from stock.")
      );
    } else if (invalidComponents > 0) {
      bomStatus = "INCOMPLETE";
      issues.push(
        `${invalidComponents} component(s) carry a zero quantity — either the quantity is missing, or it is a trace dose below the quantity precision.`
      );
    } else if (bomCost === null || bomCost <= 0) {
      bomStatus = "NO COST";
      issues.push("The BOM does not produce a usable cost.");
    } else {
      bomStatus = "COMPLETE";
    }

    if (bom && link === "name") {
      issues.push(`BOM attached by name only ("${bom.bom_name}") — link it to the product explicitly.`);
    }
    const otherUsers = bom
      ? (usersOfBom.get(String(bom.id)) || []).filter((id) => id !== productId).map((id) => productById.get(id)?.product_name)
      : [];
    if (otherUsers.length) {
      issues.push(`This BOM is also used by ${otherUsers.length} other active product(s): ${otherUsers.join(", ")} — check for duplicate products.`);
    }
    if (unlinkedComponents > 0) {
      issues.push(`${unlinkedComponents} component(s) are text-only lines not linked to an ingredient record. Costed, but not repriced or stock-deducted.`);
    }

    // A product with no cost of its own is reported as NO COST when its BOM
    // otherwise resolves, because nothing downstream can price or margin it.
    if (productCost <= 0 && (bomStatus === "COMPLETE" || bomStatus === "NO BOM")) {
      if (bomStatus === "NO BOM") issues.push("Product also has no cost, so its GP cannot be reported.");
      else {
        bomStatus = "NO COST";
        issues.push("Product carries no cost even though its BOM resolves.");
      }
    }

    /* BOM cost and product cost measure different things and are EXPECTED to differ. */
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

    const usableBom =
      bomStatus === "COMPLETE" ||
      bomStatus === "INCOMPLETE" ||
      (bomStatus === "MISSING COMPONENT" && missingUncostedComponents === 0 && bomCost !== null && bomCost > 0);
    const soldWithoutUsableBom = sales.qty > 0 && !usableBom;
    if (soldWithoutUsableBom) {
      issues.push(
        `Sold ${sales.qty.toLocaleString("en-ZA")} unit(s) for ${sales.revenue.toFixed(2)} in this period without a usable BOM.`
      );
    }

    let severity: BomSeverity;
    if (soldWithoutUsableBom) severity = "Critical";
    else if (bomStatus === "MISSING COMPONENT") severity = "High";
    else if (bomStatus === "NO BOM" || bomStatus === "EMPTY BOM" || bomStatus === "NO COST") severity = "Medium";
    else if (bomStatus === "INCOMPLETE") severity = "Low";
    else severity = "None";

    let recommendedAction: string;
    switch (bomStatus) {
      case "NO BOM":
        recommendedAction = sales.qty > 0
          ? "Build or link a BOM — this product is being sold with an unproven cost."
          : "Build or link a BOM for this finished good.";
        break;
      case "EMPTY BOM":
        recommendedAction = "Add component lines to the existing BOM.";
        break;
      case "MISSING COMPONENT":
        recommendedAction = "Relink the line(s) to a current ingredient record.";
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
      productCode: product.sku?.trim() || productCodes.get(productId) || null,
      category: String(product.category || "Uncategorised"),
      sellingPrice,
      productCost,
      bomId: bom ? String(bom.id) : null,
      bomName: bom?.bom_name ?? null,
      bomRecordStatus: bom?.status ?? null,
      bomLink: link,
      bomStatus,
      severity,
      componentCount: lines.length,
      missingComponents,
      missingUncostedComponents,
      invalidComponents,
      unlinkedComponents,
      zeroCostComponents,
      bomCost,
      costVariance,
      costVariancePct,
      lastUpdated: bom?.updated_at || product.updated_at || null,
      unitsSold: sales.qty,
      revenue: sales.revenue,
      /* A product with no cost has an UNKNOWN gross profit, not a 100% one. */
      gp: costKnown ? gp : null,
      gpPct: costKnown && sales.revenue > 0 ? (gp / sales.revenue) * 100 : null,
      usableBom,
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
    archivedExcluded: archived.length,
    archivedRevenue: archived.reduce((s, p) => s + (salesByProduct.get(String(p.id))?.revenue || 0), 0),
    unattributedLines,
    unattributedRevenue,
  };

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  return { rows, summary, categories, from, to };
}

/* ======================================================================= I/O */

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
      .order("id", { ascending: true })
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
      "id, product_name, category, sku, selling_price, total_cost, updated_at, status, product_status, linked_bom_id",
      companyId
    ),
    loadAll<BomRow>(
      supabase,
      "vyron_cost_boms",
      "id, bom_name, product_id, finished_product_id, total_cost, cost_per_unit, yield_qty, status, bom_purpose, updated_at",
      companyId
    ),
    loadAll<BomLineRow>(
      supabase,
      "vyron_cost_bom_lines",
      "id, bom_id, ingredient_id, child_bom_id, line_name, quantity, unit_cost, line_cost",
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
  // Both reads are paginated with a stable order: one 200-invoice chunk of
  // Handcrafted carried 1,086 lines, and the unpaginated read dropped 86.
  const invoiceIds: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase
      .from("vyron_customer_invoices")
      .select("id, invoice_date, status")
      .eq("company_id", companyId);
    if (from) q = q.gte("invoice_date", from);
    if (to) q = q.lte("invoice_date", to);
    const { data, error } = await q.order("id", { ascending: true }).range(offset, offset + 999);
    if (error) throw new Error(`vyron_customer_invoices: ${error.message}`);
    for (const r of data || []) if (isSaleInvoice(r.status)) invoiceIds.push(String(r.id));
    if (!data || data.length < 1000) break;
  }

  const sales: SalesLine[] = [];
  for (let i = 0; i < invoiceIds.length; i += 100) {
    const chunk = invoiceIds.slice(i, i + 100);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("vyron_customer_invoice_lines")
        .select("id, product_id, quantity, selling_price, cost_per_unit, taxable_amount, discount_amount")
        .in("invoice_id", chunk)
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw new Error(`vyron_customer_invoice_lines: ${error.message}`);
      for (const line of data || []) {
        const qty = num(line.quantity);
        sales.push({
          productId: line.product_id ? String(line.product_id) : null,
          quantity: qty,
          revenue: invoiceLineRevenue(line),
          cost: qty * num(line.cost_per_unit),
        });
      }
      if (!data || data.length < 1000) break;
    }
  }

  /* -------------------------------------------------------------- product code */
  // Imported products have a null SKU, so the saved accounting mapping code is
  // used as the visible product code where one exists.
  const productCodes = new Map<string, string>();
  try {
    const mappings = await loadAll<{ source_item_code: string | null; product_id: string }>(
      supabase,
      "vyron_customer_item_mappings",
      "id, source_item_code, product_id",
      companyId
    );
    for (const m of mappings) {
      const code = String(m.source_item_code || "").trim();
      if (!code) continue;
      const pid = String(m.product_id);
      if (!productCodes.has(pid)) productCodes.set(pid, code);
    }
  } catch {
    // A missing mapping table must not fail the report; the column simply shows "—".
  }

  return buildBomCompletenessReport({ products, boms, bomLines, ingredients, sales, productCodes, from, to });
}
