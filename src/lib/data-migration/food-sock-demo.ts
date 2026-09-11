/**
 * Food Sock Meals — demo readiness reports, derived from a migration plan.
 *
 * Pure: reads a plan, returns data. Every figure traces to a source file and
 * row that is already recorded in the plan; nothing here reads the sources
 * again, decides identity, or writes anything.
 *
 *  - dependency report: product → finished-goods stock item → BOM →
 *    components → cost evidence → opening stock → production readiness
 *  - opening-stock report: every stock-level row, what VYRON would hold, the
 *    rounding a 4-decimal column applies, and why a row is included or not
 *  - client questions: the open business questions as explicit exception
 *    records, with the products they affect
 *  - barcodes: every GTIN still without deterministic identity
 *  - expected rows: what a demo-scope import writes, table by table
 */
import { normalizeSku, roundDecimal, scaleDecimal, subtractDecimal, type PlanItem } from "@/lib/data-migration/core";
import { COLUMN_SCALE, type CostEvidence, type FoodSockPlan } from "@/lib/data-migration/food-sock-plan";
import { selectExecutionItems, type ExecutionScope } from "@/lib/data-migration/food-sock-execute";

type P = Record<string, unknown>;
const proposed = (item?: PlanItem) => (item?.proposed || {}) as P;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

/**
 * Demo configuration: client business content (which product the demo
 * features, the open questions put to the client and the products they
 * affect). It is supplied as a JSON file beside the client's files and is
 * never kept in the repository.
 */
export type DemoQuestionConfig = {
  id: string;
  question: string;
  evidence?: string[];
  /**
   * Which finished goods the question affects — by explicit rule only, never
   * by name matching: listed SKUs, one inFlow category (priced products only),
   * or a plan issue code.
   */
  affected: { skus?: string[]; category?: string; issueCode?: string };
  demoImpact: string;
};

export type DemoConfig = {
  /** Plan product key of the product the demo produces, e.g. "product:sku:<SKU>". */
  primaryProductKey?: string;
  clientQuestions?: DemoQuestionConfig[];
};

/** Exponent that re-expresses a source quantity in the VYRON stock unit. */
function exponentFor(unit: unknown, sourceUnit: unknown) {
  return String(unit) === "kg" && /gram/i.test(String(sourceUnit || "")) ? 3 : 0;
}

/* ------------------------------------------------------------ dependencies */

export type DemoComponent = {
  component: string;
  key: string;
  class: string;
  productRow: number | null;
  bomRow: number;
  unit: string;
  sourceQuantity: string;
  sourceUnit: string | null;
  /** Exact quantity per finished unit, in the VYRON unit. */
  quantityPerUnit: string;
  unitCost: number | null;
  costEvidence: string | null;
  costSource:
    | { kind: "purchase_order"; orderNumber: string; vendor: string; orderDate: string; row: number }
    | { kind: "workbook"; row: number }
    | null;
  supplierKey: string | null;
  opening: { stockRow: number; sourceQuantity: string; quantity: string; unit: string } | null;
  unitsSupportedByOpeningStock: number;
};

export type DemoProductDependency = {
  product: string;
  sku: string | null;
  key: string;
  productRow: number | null;
  category: string | null;
  unit: string | null;
  sellingPrice: number | null;
  priceBasis: string | null;
  finishedGoodsStockItem: string;
  bom: { key: string; firstRow: number; lastRow: number; lines: number; status: "Draft"; computedCost: number | null; inflowCost: string | null } | null;
  components: DemoComponent[];
  maxUnitsFromOpeningStock: number;
  limitingComponent: string | null;
  ready: boolean;
  reasons: string[];
  clientQuestions: string[];
};

export function buildDemoDependencies(plan: FoodSockPlan, scope: ExecutionScope = "demo", config: DemoConfig = {}): DemoProductDependency[] {
  const selected = selectExecutionItems(plan, scope);
  const stockByKey = new Map(plan.stages.E_stock_items.items.map((item) => [item.sourceKey, item]));
  const evidenceByKey = new Map(plan.stages.J_supplier_costs.items.map((item) => [item.sourceKey.replace(/^cost:/, "product:"), item.proposed as unknown as CostEvidence]));
  const openingByKey = new Map(selected.K_opening_stock.map((item) => [String(proposed(item).product_key), item]));
  const readinessByKey = new Map(plan.demoReadiness.map((d) => [`product:${d.productKey}`, d]));
  const questions = buildClientQuestions(plan, scope, config);

  return selected.F_finished_goods.map((finished) => {
    const f = proposed(finished);
    const bomItem = selected.I_boms.find((b) => proposed(b).finished_product_key === finished.sourceKey);
    const b = proposed(bomItem);
    const components: DemoComponent[] = ((b.lines as P[]) || []).map((line) => {
      const key = String(line.component_key);
      const evidence = evidenceByKey.get(key);
      const opening = openingByKey.get(key);
      const o = proposed(opening);
      const exponent = exponentFor(line.unit, line.source_unit);
      const quantityPerUnit = scaleDecimal(String(line.source_quantity), -exponent);
      const openingQuantity = opening ? scaleDecimal(String(o.source_quantity), -exponentFor(o.unit, o.source_unit)) : null;
      return {
        component: String(line.component_name),
        key,
        class: String(line.component_class),
        productRow: stockByKey.get(key)?.sources[0]?.row ?? null,
        bomRow: Number(line.source_row),
        unit: String(line.unit),
        sourceQuantity: String(line.source_quantity),
        sourceUnit: str(line.source_unit),
        quantityPerUnit,
        unitCost: typeof line.unit_cost === "number" ? line.unit_cost : null,
        costEvidence: str(line.cost_evidence),
        costSource: evidence?.class === "po_confirmed" && evidence.latestPurchase
          ? { kind: "purchase_order", orderNumber: evidence.latestPurchase.orderNumber, vendor: evidence.latestPurchase.vendor, orderDate: evidence.latestPurchase.orderDate, row: evidence.latestPurchase.row }
          : evidence?.class === "average_matches_workbook" && evidence.workbookCost
            ? { kind: "workbook", row: evidence.workbookCost.row }
            : null,
        supplierKey: str(proposed(stockByKey.get(key)).supplier_key),
        opening: opening && openingQuantity !== null
          ? { stockRow: opening.sources[0].row, sourceQuantity: String(o.source_quantity), quantity: openingQuantity, unit: String(o.unit) }
          : null,
        unitsSupportedByOpeningStock: openingQuantity === null ? 0 : Math.floor(Number(openingQuantity) / Number(quantityPerUnit) + 1e-9),
      };
    });
    const limiting = components.reduce<DemoComponent | null>((min, c) => (!min || c.unitsSupportedByOpeningStock < min.unitsSupportedByOpeningStock ? c : min), null);
    const readiness = readinessByKey.get(finished.sourceKey);
    const rows = bomItem?.sources.map((s) => s.row) || [];
    return {
      product: String(f.product_name),
      sku: str(f.sku),
      key: finished.sourceKey,
      productRow: finished.sources[0]?.row ?? null,
      category: str(f.category),
      unit: str(f.unit),
      sellingPrice: typeof f.selling_price === "number" ? f.selling_price : null,
      priceBasis: str(f.price_basis),
      finishedGoodsStockItem: "Created on import: FG-<first 8 of product id>, entity-linked to the product.",
      bom: bomItem
        ? { key: bomItem.sourceKey, firstRow: Math.min(...rows), lastRow: Math.max(...rows), lines: components.length, status: "Draft", computedCost: typeof b.computed_cost === "number" ? b.computed_cost : null, inflowCost: str(b.inflow_finished_cost) }
        : null,
      components,
      maxUnitsFromOpeningStock: limiting ? limiting.unitsSupportedByOpeningStock : 0,
      limitingComponent: limiting?.component ?? null,
      ready: Boolean(readiness?.ready),
      reasons: readiness?.reasons || [],
      clientQuestions: questions.filter((q) => q.affectedProductKeys.includes(finished.sourceKey)).map((q) => q.id),
    };
  });
}

/* ------------------------------------------------------------ opening stock */

export type OpeningStockRow = {
  sourceFile: string;
  sourceRow: number;
  sourceItem: string;
  vyronItemKey: string | null;
  unit: string | null;
  sourceUnit: string | null;
  sourceQuantity: string | null;
  vyronQuantity: string | null;
  /** What a 4-decimal quantity column stores. */
  storedQuantity: string | null;
  /** vyronQuantity − storedQuantity, in the SOURCE unit. */
  roundingDifference: string | null;
  unitCost: number | null;
  costStatus: string;
  included: boolean;
  inDemoScope: boolean;
  reason: string;
};

export function buildOpeningStockReport(plan: FoodSockPlan, scope: ExecutionScope = "demo"): OpeningStockRow[] {
  const demoKeys = new Set(selectExecutionItems(plan, scope).K_opening_stock.map((item) => item.sourceKey));
  return plan.stages.K_opening_stock.items.map((item) => {
    const p = proposed(item);
    const ref = item.sources[0];
    const exponent = exponentFor(p.unit, p.source_unit);
    const vyronQuantity = p.source_quantity !== undefined && item.action === "create" ? scaleDecimal(String(p.source_quantity), -exponent) : null;
    const stored = vyronQuantity === null ? null : roundDecimal(vyronQuantity, COLUMN_SCALE.stockQuantity);
    const difference = vyronQuantity === null || stored === null ? null : scaleDecimal(subtractDecimal(vyronQuantity, stored), exponent);
    const blocking = item.issues.filter((i) => i.severity !== "warning");
    return {
      sourceFile: ref.file,
      sourceRow: ref.row,
      sourceItem: item.sourceKey.replace(/^stock:/, "").split("|")[0],
      vyronItemKey: str(p.product_key),
      unit: str(p.unit),
      sourceUnit: str(p.source_unit),
      sourceQuantity: str(p.source_quantity),
      vyronQuantity,
      storedQuantity: stored,
      roundingDifference: difference,
      unitCost: typeof p.unit_cost === "number" ? p.unit_cost : null,
      costStatus: str(p.cost_evidence) || (item.issues.some((i) => i.code === "cost_unresolved") ? "unresolved" : "n/a"),
      included: item.action === "create",
      inDemoScope: demoKeys.has(item.sourceKey),
      reason:
        item.action === "create"
          ? demoKeys.has(item.sourceKey)
            ? `Included: a component of a demo product.${item.issues.length ? ` ${item.issues.map((i) => i.code).join(", ")}.` : ""}`
            : "Planned, but outside the demo scope."
          : `${item.action}: ${(blocking.length ? blocking : item.issues).map((i) => `${i.code} — ${i.message}`).join(" | ")}`,
    };
  });
}

/* --------------------------------------------------------- client questions */

export type ClientQuestion = {
  id: string;
  status: "unresolved";
  question: string;
  evidence: string[];
  affectedProductKeys: string[];
  affectedDemoProductKeys: string[];
  affectsPrimaryDemoProduct: boolean;
  demoImpact: string;
};

/** The configured questions, each resolved against the plan. No configuration, no questions. */
export function buildClientQuestions(plan: FoodSockPlan, scope: ExecutionScope = "demo", config: DemoConfig = {}): ClientQuestion[] {
  const demoKeys = new Set(selectExecutionItems(plan, scope).F_finished_goods.map((item) => item.sourceKey));
  const finished = plan.stages.F_finished_goods.items;
  return (config.clientQuestions || []).map((q) => {
    const skus = new Set((q.affected.skus || []).map((s) => normalizeSku(s)));
    const affected = finished.filter((item) => {
      const p = proposed(item);
      return (
        (p.sku && skus.has(normalizeSku(p.sku))) ||
        (q.affected.category !== undefined && p.category === q.affected.category && typeof p.selling_price === "number") ||
        (q.affected.issueCode !== undefined && item.issues.some((x) => x.code === q.affected.issueCode))
      );
    });
    const affectedProductKeys = affected.map((item) => item.sourceKey);
    const issueEvidence = q.affected.issueCode
      ? affected.flatMap((item) => item.issues.filter((x) => x.code === q.affected.issueCode).map((x) => `${proposed(item).product_name} (inFlow row ${item.sources[0]?.row}): ${x.message}`))
      : [];
    return {
      id: q.id,
      status: "unresolved",
      question: q.question,
      evidence: [
        ...(q.evidence || []),
        ...issueEvidence,
        `Affected products (${affected.length}): ${affected.map((item) => `${proposed(item).product_name}${proposed(item).sku ? ` [${proposed(item).sku}]` : ""}, row ${item.sources[0]?.row}`).join("; ") || "none planned"}.`,
      ],
      affectedProductKeys,
      affectedDemoProductKeys: affectedProductKeys.filter((k) => demoKeys.has(k)),
      affectsPrimaryDemoProduct: Boolean(config.primaryProductKey && affectedProductKeys.includes(config.primaryProductKey)),
      demoImpact: q.demoImpact,
    };
  });
}

/* ----------------------------------------------------------------- barcodes */

export function buildBarcodeReport(plan: FoodSockPlan) {
  return plan.stages.G_barcodes.items.map((item) => ({
    gtin: item.sourceKey.replace(/^gtin:/, ""),
    sourceFile: item.sources[0]?.file,
    sourceRow: item.sources[0]?.row,
    description: str(proposed(item).gs1_description),
    status: item.action === "create" ? "deterministic" : "unresolved",
    reason: item.issues.map((i) => i.message).join(" | "),
    /** The executor never writes barcodes; a match would still need approval before any write path exists. */
    written: false,
  }));
}

/* ------------------------------------------------------------ expected rows */

export function expectedImportRows(plan: FoodSockPlan, scope: ExecutionScope = "demo") {
  const s = selectExecutionItems(plan, scope);
  const created = (items: PlanItem[]) => items.filter((i) => i.action === "create").length;
  const bomLines = s.I_boms.filter((i) => i.action === "create").reduce((n, i) => n + (((proposed(i).lines as P[]) || []).length), 0);
  const stockItems = created(s.E_stock_items) + created(s.F_finished_goods);
  return {
    vyron_cost_suppliers: created(s.C_suppliers),
    vyron_contacts: created(s.C_suppliers),
    vyron_cost_categories: created(s.B_categories),
    vyron_cost_ingredients: created(s.E_stock_items),
    vyron_cost_stock_items: stockItems,
    vyron_cost_products: created(s.F_finished_goods),
    vyron_cost_boms: created(s.I_boms),
    vyron_cost_bom_lines: bomLines,
    vyron_cost_stock_ledger: created(s.K_opening_stock),
    vyron_inventory_audit_log: stockItems,
    vyron_import_source_links: created(s.C_suppliers) + created(s.E_stock_items) + created(s.F_finished_goods) + created(s.I_boms) + created(s.K_opening_stock),
    vyron_import_runs: 1,
  };
}

export function buildDemoReport(plan: FoodSockPlan, scope: ExecutionScope = "demo", config: DemoConfig = {}) {
  const dependencies = buildDemoDependencies(plan, scope, config);
  const opening = buildOpeningStockReport(plan, scope);
  return {
    planHash: plan.planHash,
    planVersion: plan.version,
    target: plan.target,
    scope,
    sources: plan.sources.map((f) => ({ file: f.name, sha256: f.sha256, bytes: f.bytes })),
    scopeCounts: Object.fromEntries(Object.entries(selectExecutionItems(plan, scope)).map(([stage, items]) => [stage, items.length])),
    expectedImportRows: expectedImportRows(plan, scope),
    products: dependencies,
    primaryDemoProduct: (config.primaryProductKey && dependencies.find((d) => d.key === config.primaryProductKey)) || null,
    openingStock: {
      rows: opening,
      included: opening.filter((r) => r.included && r.inDemoScope).length,
      roundingFlagged: opening.filter((r) => r.inDemoScope && r.roundingDifference && r.roundingDifference !== "0").length,
      excluded: opening.filter((r) => !r.included).length,
    },
    clientQuestions: buildClientQuestions(plan, scope, config),
    barcodes: buildBarcodeReport(plan),
  };
}
