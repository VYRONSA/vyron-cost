/**
 * Food Sock Meals — Phase 1 migration plan.
 *
 * Turns the supplied sources into a per-record plan for every stage, in the
 * order master data has to settle: tenant, categories, suppliers, customers,
 * stock items (raw materials / packaging / labels), finished goods, barcodes,
 * images, BOMs, supplier costs, opening stock, outstanding purchase orders and
 * historical purchase orders. Then it classifies which finished goods are safe
 * to demonstrate.
 *
 * Pure: no database, no file system. The target (what already exists in the
 * tenant) is passed in, so the same code plans against a new tenant (empty
 * target) or a partially imported one (re-run → matches, not duplicates).
 *
 * Every rule below is exact and every decision carries its reason. Where the
 * sources disagree or are incomplete, the record becomes an exception or an
 * unresolved item. The plan never repairs the source to make a record fit.
 */
import {
  countPlan,
  decimalPlaces,
  matchEntity,
  scaleDecimal,
  normalizeName,
  normalizeSku,
  sortPlan,
  stableHash,
  type Issue,
  type MatchCandidate,
  type PlanItem,
  type SourceNumber,
  type StageCounts,
} from "@/lib/data-migration/core";
import type {
  BomLineRecord,
  FoodSockSources,
  ProductRecord,
  PurchaseOrderLineRecord,
  SourceFileInfo,
} from "@/lib/data-migration/food-sock-sources";

export const FOOD_SOCK_PLAN_VERSION = "food-sock-phase1-v1";

/** The tenant this plan is for, as the client's own documents name it. */
export const FOOD_SOCK_TENANT = {
  legalName: "Food Sock Meals (Pty) Ltd",
  evidence: [
    "Questionnaire 19.02: bank account held in the name 'Food Sock Meals (Pty)Ltd'.",
    "Questionnaire 13.02: warehouse name 'Food Sock Meals'.",
    "GS1 barcode sheet: brand 'Food Sock Meals'.",
    "The questionnaire title reads 'Food Stock Meals'; no other source uses that spelling.",
  ],
};

/**
 * Vendor records that are not businesses. Each is named explicitly with the
 * evidence for it — there is no pattern rule that could catch a real supplier.
 */
export const PSEUDO_VENDORS: Record<string, string> = {
  "order complete": "A status phrase, not a business; no purchase orders reference it.",
  "stock adjustments to use": "Used on purchase orders to post stock adjustments, not purchases.",
  "increased stock": "Used on a purchase order to post a stock increase, not a purchase.",
  "test vendor": "A test record.",
};

/** inFlow products that are charges, fees, bundles of money or tests — not stock. */
export const NON_INVENTORY_PRODUCTS: Record<string, string> = {
  "discount - only to be used by the food sock office": "A discount line.",
  "donate one": "A donation charge.",
  tip: "A tip charge.",
  test: "A test record.",
  "starter pack r4000": "A reseller starter-pack value, not a stocked item.",
  "starter pack r6500": "A reseller starter-pack value, not a stocked item.",
  "starter pack r6500 + 7 free": "A reseller starter-pack value, not a stocked item.",
  "starter pack r12000": "A reseller starter-pack value, not a stocked item.",
  "sales levy": "A levy charge.",
  "samples levy": "A levy charge.",
};

/** Relative tolerance for two cost sources to be treated as the same figure. */
export const COST_AGREEMENT_TOLERANCE = 0.005;

/**
 * Decimal scale of the VYRON columns each value lands in. A value with more
 * decimals than its column would be rounded by the database, so the plan
 * reports it rather than letting it happen silently.
 */
export const COLUMN_SCALE = {
  /** vyron_cost_ingredients.purchase_cost / true_unit_cost, vyron_cost_stock_items.current_cost / average_cost. */
  itemCost: 4,
  /** vyron_cost_stock_items.qty_on_hand, vyron_cost_stock_ledger.quantity_in. */
  stockQuantity: 4,
  /** vyron_cost_bom_lines.quantity (widened by 20260826120000). */
  bomQuantity: 6,
} as const;

/**
 * The unit an item is held in. Items inFlow keeps in grams but buys in kg are
 * held in kg, converted with inFlow's own purchasing ratio (1 kg's = 1000
 * grams) by an exact decimal shift. Per-gram costs carry five decimals, which
 * VYRON's four-decimal cost columns would round (Salt 0.00378 → 0.0038, 0.5%);
 * per-kg they need at most two. Anything else stays in its inFlow unit.
 */
type StockUnit = { unit: string; exponent: number; sourceUnit: string; conversion: string | null };

function stockUnitOf(product: ProductRecord): StockUnit {
  const ratio = product.purchasingRatio.kind === "number" ? product.purchasingRatio.value : null;
  if (normalizeName(product.uom) === "grams" && normalizeName(product.purchasingUom) === "kg's" && ratio === 1000) {
    return { unit: "kg", exponent: 3, sourceUnit: product.uom, conversion: "grams → kg by inFlow's purchasing ratio (1 kg's = 1000 grams), exact decimal shift" };
  }
  return { unit: product.uom.trim() || "unit", exponent: 0, sourceUnit: product.uom, conversion: null };
}

/** A source number re-expressed exactly in another power-of-ten unit, or null when it is not a plain number. */
function scaleSourceNumber(value: SourceNumber, exponent: number): string | null {
  if (value.kind !== "number") return null;
  try {
    return scaleDecimal(value.raw, exponent);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ target */

export type TargetSnapshot = {
  companyId: string | null;
  suppliers: { id: string; supplier_name: string }[];
  ingredients: { id: string; ingredient_name: string }[];
  products: { id: string; product_name: string; sku: string | null }[];
  boms: { id: string; bom_name: string; product_id: string | null }[];
  stockItems: { id: string; item_code: string; entity_type: string; entity_id: string | null }[];
  /** Opening balances already posted, by stock item id. */
  openingBalanceStockItemIds: string[];
  sourceLinks: { source_system: string; source_entity: string; source_key: string; entity_type: string; entity_id: string }[];
  categories: { id: string; category_name: string; category_type: string | null }[];
};

export function emptyTarget(companyId: string | null = null): TargetSnapshot {
  return { companyId, suppliers: [], ingredients: [], products: [], boms: [], stockItems: [], openingBalanceStockItemIds: [], sourceLinks: [], categories: [] };
}

/* -------------------------------------------------------------- plan types */

export type StageName =
  | "A_tenant"
  | "B_categories"
  | "C_suppliers"
  | "D_customers"
  | "E_stock_items"
  | "F_finished_goods"
  | "G_barcodes"
  | "H_images"
  | "I_boms"
  | "J_supplier_costs"
  | "K_opening_stock"
  | "L_open_purchase_orders"
  | "M_historical_purchase_orders";

export const STAGE_TABLES: Record<StageName, string[]> = {
  A_tenant: ["vyron_cost_companies", "vyron_workspaces", "vyron_workspace_memberships (created by the admin flow, not by this import)"],
  B_categories: ["vyron_cost_categories"],
  C_suppliers: ["vyron_cost_suppliers", "vyron_contacts", "vyron_import_source_links"],
  D_customers: ["vyron_customers (deferred — nothing written in Phase 1)"],
  E_stock_items: ["vyron_cost_ingredients", "vyron_cost_stock_items", "vyron_inventory_audit_log", "vyron_import_source_links"],
  F_finished_goods: ["vyron_cost_products", "vyron_cost_stock_items", "vyron_inventory_audit_log", "vyron_import_source_links"],
  G_barcodes: ["vyron_cost_stock_items.barcode (only for a deterministic GTIN match)"],
  H_images: ["none — VYRON has no product image field; deferred"],
  I_boms: ["vyron_cost_boms", "vyron_cost_bom_lines", "vyron_cost_products.linked_bom_id", "vyron_import_source_links"],
  J_supplier_costs: ["vyron_cost_ingredients.supplier_id / purchase_cost (set in stage E)"],
  K_opening_stock: ["vyron_cost_stock_ledger", "vyron_cost_stock_items (qty_on_hand, average_cost)", "vyron_cost_low_stock_alerts", "vyron_inventory_audit_log"],
  L_open_purchase_orders: ["vyron_cost_purchase_orders", "vyron_cost_purchase_order_lines"],
  M_historical_purchase_orders: ["none — reference only"],
};

export type ProductClass =
  | "raw_material"
  | "packaging"
  | "label"
  | "finished_good"
  | "finished_no_bom"
  | "merchandise"
  | "non_inventory";

export type CostEvidenceClass = "po_confirmed" | "average_matches_workbook" | "inflow_only" | "conflict" | "unresolved";

export type CostEvidence = {
  class: CostEvidenceClass;
  /** The inFlow cost per stock unit, when there is one. Never a substitute for a missing value. */
  costPerUnit: number | null;
  unit: string;
  inflowCost: string;
  latestPurchase: { orderNumber: string; vendor: string; orderDate: string; unitPrice: number; uom: string; perStockUnit: number | null; row: number } | null;
  workbookCost: { value: string; row: number } | null;
  detail: string;
};

export type DemoReadiness = { productKey: string; productName: string; sku: string; ready: boolean; reasons: string[] };

export type FoodSockPlan = {
  version: string;
  tenant: typeof FOOD_SOCK_TENANT;
  target: { companyId: string | null; mode: "new_tenant" | "existing_tenant" };
  sources: SourceFileInfo[];
  stages: Record<StageName, { tables: string[]; counts: StageCounts; items: PlanItem[] }>;
  demoReadiness: DemoReadiness[];
  planHash: string;
};

/* ----------------------------------------------------------------- helpers */

const issue = (severity: Issue["severity"], code: string, message: string, field?: string): Issue => ({ severity, code, message, ...(field ? { field } : {}) });

const displayName = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();

export function productKey(product: Pick<ProductRecord, "sku" | "name">): string {
  return product.sku.trim() ? `sku:${normalizeSku(product.sku)}` : `name:${normalizeName(product.name)}`;
}

const numberOf = (value: SourceNumber): number | null => (value.kind === "number" ? value.value : null);
const describe = (value: SourceNumber): string => (value.kind === "number" ? value.raw : value.kind === "blank" ? "(blank)" : value.raw);
const agrees = (a: number, b: number) => b !== 0 && Math.abs(a / b - 1) <= COST_AGREEMENT_TOLERANCE;

type ProductIndex = {
  bySku: Map<string, ProductRecord[]>;
  byName: Map<string, ProductRecord[]>;
};

function indexProducts(products: ProductRecord[]): ProductIndex {
  const bySku = new Map<string, ProductRecord[]>();
  const byName = new Map<string, ProductRecord[]>();
  for (const product of products) {
    if (product.sku.trim()) bySku.set(normalizeSku(product.sku), [...(bySku.get(normalizeSku(product.sku)) || []), product]);
    byName.set(normalizeName(product.name), [...(byName.get(normalizeName(product.name)) || []), product]);
  }
  return { bySku, byName };
}

type SourceResolution =
  | { status: "matched"; product: ProductRecord; rule: "exact_sku" | "normalized_sku" | "normalized_name" }
  | { status: "none"; detail: string }
  | { status: "ambiguous"; detail: string }
  | { status: "conflict"; detail: string };

/**
 * Which inFlow product a reference (from a BOM, stock, PO or image row) means.
 * SKU first, exact then normalised; a SKU hit whose name disagrees is a
 * conflict, not a match. Without a SKU, the exact normalised name. Never
 * anything looser.
 */
function resolveSourceProduct(index: ProductIndex, sku: string, name: string): SourceResolution {
  const skuText = sku.trim();
  if (skuText) {
    const hits = index.bySku.get(normalizeSku(skuText)) || [];
    if (hits.length > 1) return { status: "ambiguous", detail: `SKU "${skuText}" is carried by ${hits.length} products.` };
    if (hits.length === 1) {
      const product = hits[0];
      if (name.trim() && normalizeName(name) !== normalizeName(product.name)) {
        return { status: "conflict", detail: `SKU "${skuText}" belongs to "${displayName(product.name)}", not "${displayName(name)}".` };
      }
      return { status: "matched", product, rule: product.sku.trim() === skuText ? "exact_sku" : "normalized_sku" };
    }
    const byName = index.byName.get(normalizeName(name)) || [];
    if (byName.length === 1) {
      return {
        status: "conflict",
        detail: `SKU "${skuText}" is not in inFlow; the name "${displayName(name)}" belongs to a product with SKU "${byName[0].sku || "(none)"}".`,
      };
    }
    return { status: "none", detail: `Neither SKU "${skuText}" nor name "${displayName(name)}" is an inFlow product.` };
  }
  const hits = index.byName.get(normalizeName(name)) || [];
  if (hits.length === 1) return { status: "matched", product: hits[0], rule: "normalized_name" };
  if (hits.length > 1) return { status: "ambiguous", detail: `The name "${displayName(name)}" is carried by ${hits.length} products.` };
  return { status: "none", detail: `"${displayName(name)}" is not an inFlow product.` };
}

/* ------------------------------------------------------------ the planner */

export function buildFoodSockPlan(sources: FoodSockSources, target: TargetSnapshot = emptyTarget()): FoodSockPlan {
  const index = indexProducts(sources.products);
  const linkMap = (entity: string) =>
    new Map(target.sourceLinks.filter((link) => link.source_system === "inflow" && link.source_entity === entity).map((link) => [link.source_key, link.entity_id]));

  /* ---- BOM groups first: a product is a finished good only if it is made. */
  type BomGroup = { sourceKey: string; finishedName: string; finishedSku: string; lines: BomLineRecord[] };
  const groups = new Map<string, BomGroup>();
  for (const line of sources.bomLines) {
    const key = `bom:${line.finishedSku.trim() ? `sku:${normalizeSku(line.finishedSku)}|` : ""}name:${normalizeName(line.finishedName)}`;
    const group = groups.get(key) || { sourceKey: key, finishedName: line.finishedName, finishedSku: line.finishedSku, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  // Lines in source-row order, and the group's display identity from its first
  // row — so the plan does not depend on the order rows arrive in.
  for (const group of groups.values()) {
    group.lines.sort((a, b) => a.ref.row - b.ref.row);
    group.finishedName = group.lines[0].finishedName;
    group.finishedSku = group.lines[0].finishedSku;
  }
  const groupResolution = new Map<string, SourceResolution>();
  const manufactured = new Set<string>();
  for (const group of groups.values()) {
    const resolution = resolveSourceProduct(index, group.finishedSku, group.finishedName);
    groupResolution.set(group.sourceKey, resolution);
    if (resolution.status === "matched") manufactured.add(productKey(resolution.product));
  }
  /** Products some BOM consumes — what makes a "Buckets" item packaging rather than a sold bucket. */
  const usedAsComponent = new Set<string>();
  for (const line of sources.bomLines) {
    const resolution = resolveSourceProduct(index, line.componentSku, line.componentName);
    if (resolution.status === "matched") usedAsComponent.add(productKey(resolution.product));
  }

  /* ---- classify every inFlow product. */
  const classOf = new Map<string, ProductClass>();
  const classReason = new Map<string, string>();
  for (const product of sources.products) {
    const key = productKey(product);
    const nonInventory = NON_INVENTORY_PRODUCTS[normalizeName(product.name)];
    let cls: ProductClass;
    let reason: string;
    if (product.category === "Admin" || product.itemType === "Service" || nonInventory) {
      cls = "non_inventory";
      reason = nonInventory || `inFlow ${product.itemType === "Service" ? "item type Service" : "category Admin"}.`;
    } else if (manufactured.has(key)) {
      cls = "finished_good";
      reason = "It is the output of an inFlow bill of materials.";
    } else if (product.category === "Raw Stock" && normalizeName(product.uom) === "grams") {
      cls = "raw_material";
      reason = "inFlow category Raw Stock, held in grams.";
    } else if (product.category === "Stickers") {
      cls = "label";
      reason = "inFlow category Stickers.";
    } else if (["Bags", "Insert", "Raw Stock"].includes(product.category) || (product.category === "Buckets" && usedAsComponent.has(key))) {
      cls = "packaging";
      reason = product.category === "Buckets" ? "inFlow category Buckets, consumed as a component by a bill of materials." : `inFlow category ${product.category}.`;
    } else if (["Meal for 4", "Heartfelt Foods", "Buckets"].includes(product.category)) {
      cls = "finished_no_bom";
      reason = `inFlow category ${product.category}; sold, but no bill of materials produces it and none consumes it.`;
    } else {
      cls = "merchandise";
      reason = `inFlow category ${product.category || "(blank)"}, not made and not an ingredient.`;
    }
    classOf.set(key, cls);
    classReason.set(key, reason);
  }

  const duplicateKeys = new Set(
    [...sources.products.reduce((m, p) => m.set(productKey(p), (m.get(productKey(p)) || 0) + 1), new Map<string, number>())]
      .filter(([, n]) => n > 1)
      .map(([k]) => k)
  );
  const discontinued = new Set(sources.discontinuedNames.map((d) => normalizeName(d.name)));
  const pseudoVendor = (name: string) => Boolean(PSEUDO_VENDORS[normalizeName(name)]);

  /* ---- latest genuine purchase per product (pseudo vendors excluded). */
  const latestPurchase = new Map<string, PurchaseOrderLineRecord>();
  for (const line of sources.purchaseOrderLines) {
    if (!line.productName.trim() || pseudoVendor(line.vendor) || line.isCancelled || line.isQuote) continue;
    const price = numberOf(line.unitPrice);
    if (price === null || price <= 0) continue;
    const resolution = resolveSourceProduct(index, line.sku, line.productName);
    if (resolution.status !== "matched") continue;
    const key = productKey(resolution.product);
    const previous = latestPurchase.get(key);
    if (
      !previous ||
      line.orderDate > previous.orderDate ||
      (line.orderDate === previous.orderDate && line.orderNumber > previous.orderNumber) ||
      (line.orderDate === previous.orderDate && line.orderNumber === previous.orderNumber && line.ref.row > previous.ref.row)
    ) {
      latestPurchase.set(key, line);
    }
  }
  const workbookCostByName = new Map<string, { value: SourceNumber; row: number }>();
  for (const entry of [...sources.costReference].sort((a, b) => a.ref.row - b.ref.row)) {
    if (!workbookCostByName.has(normalizeName(entry.component))) workbookCostByName.set(normalizeName(entry.component), { value: entry.costFactor, row: entry.ref.row });
  }

  function costEvidence(product: ProductRecord): CostEvidence {
    const key = productKey(product);
    const cost = numberOf(product.cost);
    const purchase = latestPurchase.get(key) || null;
    const workbook = workbookCostByName.get(normalizeName(product.name)) || null;
    const ratio = numberOf(product.purchasingRatio);
    let perStockUnit: number | null = null;
    if (purchase) {
      const price = numberOf(purchase.unitPrice) as number;
      if (product.purchasingUom && normalizeName(purchase.uom) === normalizeName(product.purchasingUom) && ratio && ratio > 0) perStockUnit = price / ratio;
      else if (normalizeName(purchase.uom) === normalizeName(product.uom)) perStockUnit = price;
    }
    const base = {
      unit: product.uom,
      inflowCost: describe(product.cost),
      latestPurchase: purchase
        ? { orderNumber: purchase.orderNumber, vendor: purchase.vendor, orderDate: purchase.orderDate, unitPrice: numberOf(purchase.unitPrice) as number, uom: purchase.uom, perStockUnit, row: purchase.ref.row }
        : null,
      workbookCost: workbook ? { value: describe(workbook.value), row: workbook.row } : null,
    };
    if (cost === null || cost <= 0) {
      return { ...base, class: "unresolved", costPerUnit: null, detail: `inFlow cost is ${describe(product.cost)} — unknown, not free.` };
    }
    if (perStockUnit !== null && agrees(perStockUnit, cost)) {
      return { ...base, class: "po_confirmed", costPerUnit: cost, detail: `Equals the latest purchase (${purchase?.orderNumber}, ${purchase?.vendor}) per ${product.uom || "unit"}.` };
    }
    const workbookValue = workbook ? numberOf(workbook.value) : null;
    if (workbookValue !== null && agrees(workbookValue, cost)) {
      return {
        ...base,
        class: "average_matches_workbook",
        costPerUnit: cost,
        detail: `inFlow cost equals the costing workbook; ${perStockUnit !== null ? `the latest purchase differs by ${((perStockUnit / cost - 1) * 100).toFixed(1)}%` : "no comparable purchase"}.`,
      };
    }
    if (perStockUnit === null && workbookValue === null) {
      return { ...base, class: "inflow_only", costPerUnit: cost, detail: "inFlow cost has no purchase or workbook figure to confirm it." };
    }
    return {
      ...base,
      class: "conflict",
      costPerUnit: cost,
      detail: `inFlow ${cost} disagrees with ${[perStockUnit !== null ? `latest purchase ${perStockUnit}` : null, workbookValue !== null ? `workbook ${workbookValue}` : null].filter(Boolean).join(" and ")}.`,
    };
  }

  const stages = {} as FoodSockPlan["stages"];
  const put = (stage: StageName, items: PlanItem[]) => {
    const sorted = sortPlan(items);
    stages[stage] = { tables: STAGE_TABLES[stage], counts: countPlan(sorted), items: sorted };
  };

  /* ================================================================ A tenant */
  put("A_tenant", [
    target.companyId
      ? { stage: "A_tenant", sourceKey: "tenant", sources: [], action: "match", targetId: target.companyId, issues: [], proposed: { legal_name: FOOD_SOCK_TENANT.legalName } }
      : {
          stage: "A_tenant",
          sourceKey: "tenant",
          sources: [],
          action: "exception",
          proposed: { legal_name: FOOD_SOCK_TENANT.legalName },
          issues: [
            issue(
              "exception",
              "tenant_missing",
              "No Food Sock tenant exists. It must be created through the VYRON admin flow (createClientWorkspace) once the name and owner are approved; nothing below is written until then."
            ),
          ],
        },
  ]);

  /* ============================================================ C suppliers */
  const supplierLinks = linkMap("vendor");
  const supplierCandidates: MatchCandidate[] = target.suppliers.map((s) => ({ id: s.id, name: s.supplier_name }));
  const vendorNameCount = sources.vendors.reduce((m, v) => m.set(normalizeName(v.name), (m.get(normalizeName(v.name)) || 0) + 1), new Map<string, number>());
  const orderedVendors = new Set(sources.purchaseOrderLines.map((l) => normalizeName(l.vendor)));
  const supplierKeyByName = new Map<string, string>();
  const supplierItems: PlanItem[] = sources.vendors.map((vendor) => {
    const name = displayName(vendor.name);
    const sourceKey = `vendor:${normalizeName(vendor.name)}`;
    const issues: Issue[] = [];
    if (!name) return { stage: "C_suppliers", sourceKey: `vendor:row:${vendor.ref.row}`, sources: [vendor.ref], action: "exception", issues: [issue("exception", "blank_name", "Vendor name is blank.")] };
    if (PSEUDO_VENDORS[normalizeName(name)]) {
      return { stage: "C_suppliers", sourceKey, sources: [vendor.ref], action: "skip", classification: "pseudo_vendor", issues: [issue("warning", "pseudo_vendor", PSEUDO_VENDORS[normalizeName(name)])] };
    }
    if ((vendorNameCount.get(normalizeName(vendor.name)) || 0) > 1) {
      return { stage: "C_suppliers", sourceKey, sources: [vendor.ref], action: "exception", issues: [issue("exception", "duplicate_vendor", "More than one vendor has this name.")] };
    }
    if (vendor.name !== vendor.name.trim()) issues.push(issue("warning", "whitespace", `Source name has surrounding whitespace ("${vendor.name}").`, "name"));
    if (!orderedVendors.has(normalizeName(vendor.name))) issues.push(issue("warning", "no_purchase_history", "No purchase order in the export references this vendor."));
    if (vendor.isActive === false) issues.push(issue("warning", "inactive", "Marked inactive in inFlow."));
    supplierKeyByName.set(normalizeName(name), sourceKey);
    const proposed = {
      supplier_name: name,
      contact_person: vendor.contactName.trim() || null,
      contact_email: vendor.email.trim() || null,
      phone: vendor.phone.trim() || null,
      currency: vendor.currency || null,
      prices_include_tax: vendor.taxInclusivePricing,
    };
    const match = matchEntity({ sourceKey, name }, supplierCandidates, { sourceLinks: supplierLinks });
    if (match.status === "ambiguous") return { stage: "C_suppliers", sourceKey, sources: [vendor.ref], action: "exception", issues: [...issues, issue("exception", "ambiguous_target", `Matches ${match.targetIds.length} existing suppliers.`)] };
    if (match.status === "matched") return { stage: "C_suppliers", sourceKey, sources: [vendor.ref], action: "match", matchRule: match.rule, targetId: match.targetId, proposed, issues };
    return { stage: "C_suppliers", sourceKey, sources: [vendor.ref], action: "create", classification: "supplier", proposed, issues };
  });
  put("C_suppliers", supplierItems);
  const supplierPlanned = new Set(supplierItems.filter((i) => i.action === "create" || i.action === "match").map((i) => i.sourceKey));

  /* ============================================================ D customers */
  const contactsInfo = sources.files.find((f) => f.key === "contacts");
  const contactNameCount = sources.contacts.reduce((m, c) => m.set(normalizeName(c.name), (m.get(normalizeName(c.name)) || 0) + 1), new Map<string, number>());
  put(
    "D_customers",
    sources.contacts.map((contact) => ({
      stage: "D_customers",
      sourceKey: `contact:row:${contact.ref.row}`,
      sources: [contact.ref],
      action: "skip" as const,
      classification: (contactNameCount.get(normalizeName(contact.name)) || 0) > 1 ? "deferred_duplicate_name" : "deferred",
      issues: [
        issue(
          "warning",
          "customers_deferred",
          `Deferred: the export's header has ${contactsInfo?.headerWidth ?? "?"} columns but rows carry ${Object.keys(contactsInfo?.rowWidths || {}).join("/")} cells, and no column says customer or supplier. Not needed for the Phase 1 workflows.`
        ),
      ],
    }))
  );

  /* ======================================================== E stock items */
  const ingredientLinks = linkMap("product");
  const ingredientCandidates: MatchCandidate[] = target.ingredients.map((i) => ({ id: i.id, name: i.ingredient_name }));
  const productCandidates: MatchCandidate[] = target.products.map((p) => ({ id: p.id, name: p.product_name, sku: p.sku }));
  const evidenceByKey = new Map<string, CostEvidence>();
  /** Cost per STOCK unit (kg for converted items), exact; null when unresolved. */
  const stockCostByKey = new Map<string, number | null>();
  const stockItems: PlanItem[] = [];
  const finishedItems: PlanItem[] = [];

  for (const product of sources.products) {
    const key = productKey(product);
    const cls = classOf.get(key) as ProductClass;
    const sourceKey = `product:${key}`;
    const name = displayName(product.name);
    const common = { sources: [product.ref], classification: cls };
    const baseIssues: Issue[] = [];
    const nonBreakingSpace = [...product.name].some((character) => character.charCodeAt(0) === 160);
    if (product.name !== product.name.trim() || /\s{2,}/.test(product.name) || nonBreakingSpace) baseIssues.push(issue("warning", "whitespace", `Source name has irregular whitespace ("${product.name}").`, "name"));

    if (duplicateKeys.has(key)) {
      const item: PlanItem = { stage: "E_stock_items", sourceKey, ...common, action: "exception", issues: [issue("exception", "duplicate_identity", `More than one inFlow product has identity ${key}.`)] };
      (cls === "finished_good" ? finishedItems : stockItems).push({ ...item, stage: cls === "finished_good" ? "F_finished_goods" : "E_stock_items" });
      continue;
    }

    if (cls === "raw_material" || cls === "packaging" || cls === "label") {
      const evidence = costEvidence(product);
      evidenceByKey.set(key, evidence);
      const issues = [...baseIssues];
      if (evidence.class === "unresolved") issues.push(issue("unresolved", "cost_unresolved", evidence.detail, "cost"));
      else if (evidence.class === "conflict") issues.push(issue("warning", "cost_conflict", evidence.detail, "cost"));
      else if (evidence.class === "inflow_only") issues.push(issue("warning", "cost_unconfirmed", evidence.detail, "cost"));
      const vendorKey = product.lastVendor.trim() ? supplierKeyByName.get(normalizeName(product.lastVendor)) || null : null;
      if (product.lastVendor.trim() && (!vendorKey || !supplierPlanned.has(vendorKey))) {
        issues.push(issue("warning", "supplier_unlinked", `Last vendor "${product.lastVendor}" is not an importable supplier; no supplier link is set.`, "supplier"));
      }
      if (!product.uom.trim()) issues.push(issue("warning", "unit_blank", "inFlow has no stock unit for this item; it is held per unit.", "unit"));
      const stockUnit = stockUnitOf(product);
      const scaledCost = evidence.costPerUnit === null ? null : scaleSourceNumber(product.cost, stockUnit.exponent);
      if (evidence.costPerUnit !== null && scaledCost === null) {
        issues.push(issue("unresolved", "cost_not_plain_decimal", `inFlow cost "${describe(product.cost)}" cannot be re-expressed exactly.`, "cost"));
      }
      if (scaledCost !== null && decimalPlaces(scaledCost) > COLUMN_SCALE.itemCost) {
        issues.push(issue("warning", "precision_cost", `Cost ${scaledCost} per ${stockUnit.unit} has more than ${COLUMN_SCALE.itemCost} decimals; VYRON would round it.`, "cost"));
      }
      stockCostByKey.set(key, scaledCost === null ? null : Number(scaledCost));
      const proposed = {
        ingredient_name: name,
        category: product.category,
        stock_class: cls,
        unit: stockUnit.unit,
        cost_per_unit: scaledCost === null ? null : Number(scaledCost),
        source_unit: stockUnit.sourceUnit || null,
        source_cost: describe(product.cost),
        unit_conversion: stockUnit.conversion,
        cost_evidence: evidence.class,
        supplier_key: vendorKey && supplierPlanned.has(vendorKey) ? vendorKey : null,
        purchasing_uom: product.purchasingUom || null,
        purchasing_ratio: numberOf(product.purchasingRatio),
        inflow_sku: product.sku || null,
        default_warehouse: "Somerset West Warehouse",
      };
      if (proposed.cost_per_unit === null) {
        // VYRON has no "unknown cost" state: a written item would carry cost 0,
        // which is exactly the TBC-to-zero substitution the rules forbid.
        stockItems.push({
          stage: "E_stock_items",
          sourceKey,
          ...common,
          action: "exception",
          proposed,
          issues: [...issues, issue("exception", "cost_unresolved_not_written", "Not written: VYRON would store its cost as 0. Supply the cost first.", "cost")],
        });
        continue;
      }
      const match = matchEntity({ sourceKey, name }, ingredientCandidates, { sourceLinks: ingredientLinks });
      if (match.status === "ambiguous") {
        stockItems.push({ stage: "E_stock_items", sourceKey, ...common, action: "exception", issues: [...issues, issue("exception", "ambiguous_target", `Matches ${match.targetIds.length} existing ingredients.`)] });
      } else if (match.status === "matched") {
        stockItems.push({ stage: "E_stock_items", sourceKey, ...common, action: "match", matchRule: match.rule, targetId: match.targetId, proposed, issues });
      } else {
        stockItems.push({ stage: "E_stock_items", sourceKey, ...common, action: "create", proposed, issues });
      }
      continue;
    }

    if (cls === "finished_good") {
      const issues = [...baseIssues];
      const price = numberOf(product.defaultPrice);
      let sellingPrice: number | null = null;
      let priceBasis = "unknown";
      if (price === null || price <= 0) issues.push(issue("unresolved", "price_unresolved", `inFlow default price is ${describe(product.defaultPrice)}.`, "selling_price"));
      else if (product.taxInclusivePrice === null) issues.push(issue("unresolved", "price_vat_basis_unknown", "inFlow does not say whether the default price includes VAT.", "selling_price"));
      else {
        sellingPrice = price;
        priceBasis = product.taxInclusivePrice ? "incl_vat" : "excl_vat";
      }
      const isDiscontinued = discontinued.has(normalizeName(product.name));
      if (isDiscontinued) issues.push(issue("warning", "discontinued", "The client lists this product as discontinued (questionnaire 03.26)."));
      // Identity must agree across sources, not only within inFlow.
      const rangeConflict = [...sources.productRange].sort((a, b) => a.ref.row - b.ref.row).find(
        (r) => normalizeName(r.product) === normalizeName(product.name) && r.sku.trim() && normalizeSku(r.sku) !== normalizeSku(product.sku)
      );
      if (rangeConflict) {
        issues.push(
          issue("warning", "sku_differs_from_product_range", `Product Range sheet (row ${rangeConflict.ref.row}) gives SKU "${rangeConflict.sku}"; inFlow has "${product.sku || "(none)"}".`, "sku")
        );
      }
      const variant = /\bhalf\b/i.test(product.name) ? "half_variant" : null;
      if (!product.sku.trim()) issues.push(issue("warning", "no_sku", "No SKU in inFlow; identity rests on the exact name."));
      const proposed = {
        product_name: name,
        sku: product.sku.trim() || null,
        category: product.category,
        unit: product.uom.trim() || "unit",
        selling_price: sellingPrice,
        price_basis: priceBasis,
        product_status: isDiscontinued ? "Discontinued" : "Active",
        variant,
        inflow_cost: describe(product.cost),
      };
      if (sellingPrice === null) {
        // VYRON has no "unknown price" state: a written product would carry
        // selling price 0 — a blank source value turned into a number.
        finishedItems.push({
          stage: "F_finished_goods",
          sourceKey,
          ...common,
          action: "exception",
          proposed,
          issues: [...issues, issue("exception", "price_unresolved_not_written", "Not written: VYRON would store the selling price as 0. Supply the price and its VAT basis first.", "selling_price")],
        });
        continue;
      }
      const match = matchEntity({ sourceKey, sku: product.sku, name }, productCandidates, { sourceLinks: ingredientLinks });
      if (match.status === "ambiguous") {
        finishedItems.push({ stage: "F_finished_goods", sourceKey, ...common, action: "exception", issues: [...issues, issue("exception", "ambiguous_target", `Matches ${match.targetIds.length} existing products.`)] });
      } else if (match.status === "matched") {
        finishedItems.push({ stage: "F_finished_goods", sourceKey, ...common, action: "match", matchRule: match.rule, targetId: match.targetId, proposed, issues });
      } else {
        finishedItems.push({ stage: "F_finished_goods", sourceKey, ...common, action: "create", proposed, issues });
      }
      continue;
    }

    // finished_no_bom, merchandise, non_inventory — outside Phase 1, each with its reason.
    const stage: StageName = cls === "finished_no_bom" ? "F_finished_goods" : "E_stock_items";
    (stage === "F_finished_goods" ? finishedItems : stockItems).push({
      stage,
      sourceKey,
      ...common,
      action: "skip",
      issues: [...baseIssues, issue("warning", `not_phase1_${cls}`, `${classReason.get(key)} Not imported in Phase 1.`)],
    });
  }
  put("E_stock_items", stockItems);
  put("F_finished_goods", finishedItems);

  const plannedStock = new Map(stockItems.filter((i) => i.action === "create" || i.action === "match").map((i) => [i.sourceKey, i]));
  const plannedFinished = new Map(finishedItems.filter((i) => i.action === "create" || i.action === "match").map((i) => [i.sourceKey, i]));

  /* ========================================================== B categories */
  const categoryItems = new Map<string, PlanItem>();
  for (const item of [...plannedStock.values(), ...plannedFinished.values()]) {
    const category = String((item.proposed as Record<string, unknown>).category || "");
    const type = item.stage === "E_stock_items" ? "Ingredient" : "Product";
    const sourceKey = `category:${type}:${normalizeName(category)}`;
    if (!category || categoryItems.has(sourceKey)) continue;
    const proposed = { category_name: category, category_type: type };
    // The executor's identity for a category: exact name and type in this tenant.
    const existing = [...new Set((target.categories ?? []).filter((c) => c.category_name === category && c.category_type === type).map((c) => c.id))].sort();
    if (existing.length > 1) {
      categoryItems.set(sourceKey, { stage: "B_categories", sourceKey, sources: [], action: "exception", proposed, issues: [issue("exception", "ambiguous_target", `Matches ${existing.length} existing categories.`)] });
    } else if (existing.length === 1) {
      categoryItems.set(sourceKey, { stage: "B_categories", sourceKey, sources: [], action: "match", matchRule: "exact_name", targetId: existing[0], proposed, issues: [] });
    } else {
      categoryItems.set(sourceKey, { stage: "B_categories", sourceKey, sources: [], action: "create", proposed, issues: [] });
    }
  }
  put("B_categories", [...categoryItems.values()]);

  /* ============================================================ G barcodes */
  put(
    "G_barcodes",
    sources.barcodes.map((barcode) => {
      const sourceKey = `gtin:${barcode.gtin || `row:${barcode.ref.row}`}`;
      const description = `${barcode.brand} — ${barcode.functionalName}${barcode.variant ? ` — ${barcode.variant}` : ""}, ${describe(barcode.netContent)} ${barcode.uom}`;
      if (barcode.gtinIssue) {
        return { stage: "G_barcodes", sourceKey, sources: [barcode.ref], action: "exception" as const, issues: [issue("exception", "gtin_invalid", barcode.gtinIssue, "gtin")] };
      }
      const byBarcode = sources.products.filter((p) => p.barcode.trim() === barcode.gtin);
      const bySku = sources.products.filter((p) => p.sku.trim() === barcode.gtin);
      const hits = [...new Set([...byBarcode, ...bySku])];
      if (hits.length === 1) {
        return { stage: "G_barcodes", sourceKey, sources: [barcode.ref], action: "create" as const, proposed: { gtin: barcode.gtin, product_key: `product:${productKey(hits[0])}` }, issues: [] };
      }
      return {
        stage: "G_barcodes",
        sourceKey,
        sources: [barcode.ref],
        action: "exception" as const,
        proposed: { gtin: barcode.gtin, gs1_description: description },
        issues: [
          issue(
            "exception",
            hits.length ? "gtin_ambiguous" : "gtin_unmapped",
            hits.length
              ? `GTIN is carried by ${hits.length} products.`
              : `No inFlow product carries GTIN ${barcode.gtin} as a barcode or SKU. Mapping it by description ("${description}") would be a guess; it needs an approved mapping.`
          ),
        ],
      };
    })
  );

  /* ============================================================== H images */
  put(
    "H_images",
    sources.images.map((image) => {
      const resolution = resolveSourceProduct(index, image.sku, image.name);
      const sourceKey = `image:row:${image.ref.row}`;
      if (resolution.status !== "matched") {
        return { stage: "H_images", sourceKey, sources: [image.ref], action: "exception" as const, issues: [issue("exception", `image_${resolution.status}`, resolution.detail)] };
      }
      const cls = classOf.get(productKey(resolution.product));
      return {
        stage: "H_images",
        sourceKey,
        sources: [image.ref],
        action: "skip" as const,
        classification: cls === "non_inventory" || cls === "merchandise" ? `not_phase1_${cls}` : "deferred_no_image_field",
        proposed: { product_key: `product:${productKey(resolution.product)}`, url: image.url },
        issues: [issue("warning", "image_deferred", "VYRON has no product image field and the URL is an inFlow-hosted file; the association is recorded, nothing is written.")],
      };
    })
  );

  /* ================================================================ I BOMs */
  /*
   * An existing BOM is found the way the executor finds it: through the BOM's
   * source link while that BOM still exists, else as the one BOM of the
   * finished product's linked row. A link to a removed BOM stays "create", so
   * the executor fails it closed.
   */
  const hasException = (list: Issue[]) => list.some((i) => i.severity === "exception");
  const bomLinks = linkMap("bom");
  const finishedLinks = linkMap("product");
  type ExistingBom =
    | { status: "matched"; rule: "source_link" | "existing_product_bom"; bomId: string }
    | { status: "ambiguous"; detail: string }
    | { status: "none" };
  const existingBom = (sourceKey: string, finishedKey: string): ExistingBom => {
    const linked = bomLinks.get(sourceKey);
    if (linked) return target.boms.some((b) => b.id === linked) ? { status: "matched", rule: "source_link", bomId: linked } : { status: "none" };
    const productId = finishedLinks.get(finishedKey);
    const ids = productId ? [...new Set(target.boms.filter((b) => b.product_id === productId).map((b) => b.id))].sort() : [];
    if (ids.length > 1) return { status: "ambiguous", detail: `Its finished product already has ${ids.length} BOMs; none is chosen.` };
    return ids.length === 1 ? { status: "matched", rule: "existing_product_bom", bomId: ids[0] } : { status: "none" };
  };
  const bomItems: PlanItem[] = [];
  const bomByProductKey = new Map<string, PlanItem>();
  const productTargets = new Map<string, string[]>();
  for (const group of groups.values()) {
    const resolution = groupResolution.get(group.sourceKey) as SourceResolution;
    if (resolution.status === "matched") productTargets.set(productKey(resolution.product), [...(productTargets.get(productKey(resolution.product)) || []), group.sourceKey]);
  }
  for (const group of groups.values()) {
    const refs = group.lines.map((line) => line.ref);
    const resolution = groupResolution.get(group.sourceKey) as SourceResolution;
    const label = displayName(group.finishedName);
    const copyVariant = /\bcopy\b/i.test(group.finishedName);
    if (resolution.status !== "matched") {
      bomItems.push({
        stage: "I_boms",
        sourceKey: group.sourceKey,
        sources: refs,
        action: "exception",
        classification: copyVariant ? "copy_variant" : "unmatched_finished_product",
        proposed: { finished_name: label, finished_sku: group.finishedSku || null, lines: group.lines.length },
        issues: [
          issue(
            "exception",
            `finished_${resolution.status}`,
            `${resolution.detail}${copyVariant ? " A copy is kept separate until the client confirms whether it is obsolete, an alternate or a duplicate." : ""}`
          ),
        ],
      });
      continue;
    }
    const finishedKey = productKey(resolution.product);
    const finishedPlan = plannedFinished.get(`product:${finishedKey}`);
    const issues: Issue[] = [];
    if ((productTargets.get(finishedKey) || []).length > 1) {
      issues.push(issue("exception", "multiple_boms", `${(productTargets.get(finishedKey) || []).length} BOMs produce "${displayName(resolution.product.name)}"; none is chosen.`));
    }
    if (!finishedPlan) issues.push(issue("exception", "finished_not_planned", "The finished product is not planned for import, so its BOM cannot be."));

    const active = group.lines.filter((line) => line.isActive !== false);
    const inactive = group.lines.filter((line) => line.isActive === false);
    const lines: Record<string, unknown>[] = [];
    let computedCost: number | null = 0;
    let bundle = false;
    for (const line of active) {
      const component = resolveSourceProduct(index, line.componentSku, line.componentName);
      if (component.status !== "matched") {
        issues.push(issue("exception", `component_${component.status}`, `Row ${line.ref.row}: ${component.detail}`, "component"));
        computedCost = null;
        continue;
      }
      const componentKey = productKey(component.product);
      const componentClass = classOf.get(componentKey);
      if (componentClass === "finished_good") bundle = true;
      const planned = plannedStock.get(`product:${componentKey}`);
      if (!planned && componentClass !== "finished_good") {
        issues.push(issue("exception", "component_not_planned", `Row ${line.ref.row}: "${displayName(component.product.name)}" (${componentClass}) is not planned as a stock item.`, "component"));
        computedCost = null;
        continue;
      }
      const quantity = numberOf(line.quantity);
      if (line.quantity.kind === "tbc") {
        issues.push(issue("unresolved", "quantity_tbc", `Row ${line.ref.row}: quantity is TBC.`, "quantity"));
        computedCost = null;
      } else if (quantity === null || quantity <= 0) {
        issues.push(issue("exception", "quantity_invalid", `Row ${line.ref.row}: quantity is ${describe(line.quantity)}.`, "quantity"));
        computedCost = null;
      }
      const stockUnit = stockUnitOf(component.product);
      if (line.uom.trim() && normalizeName(line.uom) !== normalizeName(component.product.uom)) {
        issues.push(issue("warning", "unit_text_differs", `Row ${line.ref.row}: BOM unit "${line.uom}" vs component unit "${component.product.uom || "(blank)"}"; the component's own unit is used.`, "unit"));
      }
      const scaledQuantity = quantity !== null && quantity > 0 ? scaleSourceNumber(line.quantity, -stockUnit.exponent) : null;
      if (scaledQuantity !== null && decimalPlaces(scaledQuantity) > COLUMN_SCALE.bomQuantity) {
        issues.push(issue("warning", "precision_bom_quantity", `Row ${line.ref.row}: ${scaledQuantity} ${stockUnit.unit} has more than ${COLUMN_SCALE.bomQuantity} decimals; VYRON would round it.`, "quantity"));
      }
      const lineQuantity = scaledQuantity === null ? null : Number(scaledQuantity);
      const evidence = evidenceByKey.get(componentKey);
      const unitCost = stockCostByKey.get(componentKey) ?? null;
      if (componentClass !== "finished_good" && unitCost === null) computedCost = null;
      if (computedCost !== null && lineQuantity !== null && unitCost !== null) computedCost += lineQuantity * unitCost;
      lines.push({
        component_key: `product:${componentKey}`,
        component_name: displayName(component.product.name),
        component_class: componentClass,
        quantity: lineQuantity,
        unit: stockUnit.unit,
        unit_cost: unitCost,
        cost_evidence: evidence?.class ?? null,
        source_quantity: describe(line.quantity),
        source_unit: line.uom || component.product.uom || null,
        source_row: line.ref.row,
      });
    }
    if (bundle) {
      issues.push(
        issue(
          "exception",
          "bundle_bom",
          "Its components are finished goods. VYRON production explodes sub-BOMs down to raw materials, so a bundle would consume ingredients instead of the finished packs it actually contains. Deferred until bundle assembly is supported."
        )
      );
      computedCost = null;
    }
    if (inactive.length) issues.push(issue("warning", "inactive_lines_excluded", `${inactive.length} inactive inFlow line(s) excluded: rows ${inactive.map((l) => l.ref.row).join(", ")}.`));
    const inflowFinishedCost = numberOf(resolution.product.cost);
    if (computedCost !== null && inflowFinishedCost !== null && inflowFinishedCost > 0 && !agrees(computedCost, inflowFinishedCost)) {
      issues.push(issue("warning", "cost_differs_from_inflow", `Computed BOM cost ${computedCost.toFixed(5)} vs inFlow product cost ${inflowFinishedCost}.`, "cost"));
    }
    const existing = hasException(issues) ? { status: "none" as const } : existingBom(group.sourceKey, `product:${finishedKey}`);
    if (existing.status === "ambiguous") issues.push(issue("exception", "ambiguous_target", existing.detail));
    const blocking = hasException(issues);
    const item: PlanItem = {
      stage: "I_boms",
      sourceKey: group.sourceKey,
      sources: refs,
      action: blocking ? "exception" : existing.status === "matched" ? "match" : "create",
      ...(!blocking && existing.status === "matched" ? { matchRule: existing.rule, targetId: existing.bomId } : {}),
      classification: bundle ? "bundle" : /\bhalf\b/i.test(group.finishedName) ? "half_variant" : "finished_good_bom",
      proposed: {
        bom_name: displayName(resolution.product.name),
        finished_product_key: `product:${finishedKey}`,
        finished_sku: resolution.product.sku || null,
        yield_qty: 1,
        yield_unit: resolution.product.uom.trim() || "unit",
        lines,
        inactive_lines_excluded: inactive.length,
        computed_cost: computedCost === null ? null : Number(computedCost.toFixed(6)),
        inflow_finished_cost: describe(resolution.product.cost),
      },
      issues,
    };
    bomItems.push(item);
    bomByProductKey.set(finishedKey, item);
  }
  put("I_boms", bomItems);

  /* ===================================================== J supplier costs */
  put(
    "J_supplier_costs",
    [...evidenceByKey.entries()].map(([key, evidence]) => {
      const stock = plannedStock.get(`product:${key}`);
      return {
        stage: "J_supplier_costs",
        sourceKey: `cost:${key}`,
        sources: stock?.sources ?? [],
        action: "skip" as const,
        classification: evidence.class,
        proposed: evidence as unknown as Record<string, unknown>,
        issues:
          evidence.class === "unresolved"
            ? [issue("unresolved", "cost_unresolved", evidence.detail, "cost")]
            : evidence.class === "po_confirmed" || evidence.class === "average_matches_workbook"
              ? []
              : [issue("warning", `cost_${evidence.class}`, evidence.detail, "cost")],
      };
    })
  );

  /* ====================================================== K opening stock */
  /*
   * An opening balance already in the tenant is found the way the executor
   * finds it: first through the balance's own source link (while its stock
   * item still holds an opening balance), then through the item's product link
   * to its stock item. A link whose balance is gone stays "create", so the
   * executor fails it closed instead of the plan hiding it.
   */
  const stockLevelLinks = linkMap("stock_level");
  const productLinks = linkMap("product");
  const openingBalanceIds = new Set(target.openingBalanceStockItemIds ?? []);
  const stockIdsByEntity = new Map<string, string[]>();
  for (const stock of target.stockItems) {
    if (!stock.entity_id) continue;
    stockIdsByEntity.set(stock.entity_id, [...(stockIdsByEntity.get(stock.entity_id) || []), stock.id]);
  }
  type ExistingBalance =
    | { status: "matched"; rule: "source_link" | "existing_opening_balance"; stockItemId: string }
    | { status: "ambiguous"; detail: string }
    | { status: "none" };
  const existingOpeningBalance = (sourceKey: string, itemKey: string): ExistingBalance => {
    const linked = stockLevelLinks.get(sourceKey);
    if (linked) return openingBalanceIds.has(linked) ? { status: "matched", rule: "source_link", stockItemId: linked } : { status: "none" };
    const entityId = productLinks.get(itemKey);
    const stockIds = entityId ? [...new Set(stockIdsByEntity.get(entityId) || [])].sort() : [];
    if (stockIds.length > 1) return { status: "ambiguous", detail: `The item has ${stockIds.length} stock items in this tenant; none is chosen.` };
    if (stockIds.length === 1 && openingBalanceIds.has(stockIds[0])) return { status: "matched", rule: "existing_opening_balance", stockItemId: stockIds[0] };
    return { status: "none" };
  };
  const openingItems: PlanItem[] = sources.stockLevels.map((row) => {
    const sourceKey = `stock:${normalizeName(row.name)}|${normalizeName(row.location)}`;
    const resolution = resolveSourceProduct(index, row.sku, row.name);
    const quantity = numberOf(row.quantity);
    const label = "inFlow stock-level export (Somerset West Warehouse), received 2026-09-10 — not a reconciled accounting opening balance.";
    const negative = quantity !== null && quantity < 0 ? [issue("exception", "negative_stock", `Source quantity ${row.quantity.kind === "number" ? row.quantity.raw : ""} is negative; never posted as opening stock. Review required.`, "quantity")] : [];
    if (resolution.status !== "matched") {
      return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "exception" as const, issues: [...negative, issue("exception", `stock_${resolution.status}`, resolution.detail)] };
    }
    const key = productKey(resolution.product);
    const cls = classOf.get(key);
    const planned = plannedStock.get(`product:${key}`) || plannedFinished.get(`product:${key}`);
    if (negative.length) return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "exception" as const, classification: cls, issues: negative };
    if (row.quantity.kind !== "number") {
      return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "exception" as const, classification: cls, issues: [issue(row.quantity.kind === "tbc" ? "unresolved" : "exception", "quantity_invalid", `Quantity is ${describe(row.quantity)}.`, "quantity")] };
    }
    if (quantity === 0) return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "skip" as const, classification: cls, issues: [issue("warning", "zero_stock", "Zero quantity; nothing to post.")] };
    const itemPlan = [...stockItems, ...finishedItems].find((item) => item.sourceKey === `product:${key}`);
    if (itemPlan?.action === "exception") {
      return {
        stage: "K_opening_stock",
        sourceKey,
        sources: [row.ref],
        action: "exception" as const,
        classification: cls,
        issues: [
          ...itemPlan.issues.filter((i) => i.severity === "unresolved"),
          issue("exception", "item_not_importable", `The stock item itself is not written (${itemPlan.issues.filter((i) => i.severity === "exception").map((i) => i.code).join(", ")}), so its balance is not posted.`),
        ],
      };
    }
    if (!planned) {
      return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "skip" as const, classification: cls, issues: [issue("warning", "item_not_imported", `"${displayName(resolution.product.name)}" (${cls}) is not imported in Phase 1.`)] };
    }
    const evidence = evidenceByKey.get(key);
    const stockUnit = stockUnitOf(resolution.product);
    const scaled = scaleSourceNumber(row.quantity, -stockUnit.exponent);
    const unitCost = stockCostByKey.get(key) ?? null;
    if (!evidence || unitCost === null) {
      return {
        stage: "K_opening_stock",
        sourceKey,
        sources: [row.ref],
        action: "exception" as const,
        classification: cls,
        proposed: { product_key: `product:${key}`, quantity: scaled === null ? null : Number(scaled), unit: stockUnit.unit, source_quantity: describe(row.quantity) },
        issues: [issue("unresolved", "cost_unresolved", "The item's cost is unresolved, so the balance cannot be valued; it is not posted at zero.", "unit_cost")],
      };
    }
    if (scaled === null) {
      return { stage: "K_opening_stock", sourceKey, sources: [row.ref], action: "exception" as const, classification: cls, issues: [issue("exception", "quantity_not_plain_decimal", `Quantity "${describe(row.quantity)}" cannot be re-expressed exactly.`, "quantity")] };
    }
    const warnings: Issue[] = [];
    if (evidence.class === "conflict" || evidence.class === "inflow_only") warnings.push(issue("warning", `cost_${evidence.class}`, evidence.detail, "unit_cost"));
    if (decimalPlaces(scaled) > COLUMN_SCALE.stockQuantity) {
      const stored = Math.round(Number(scaled) * 10 ** COLUMN_SCALE.stockQuantity) / 10 ** COLUMN_SCALE.stockQuantity;
      const lossInSourceUnit = Math.abs(Number(scaled) - stored) * 10 ** stockUnit.exponent;
      warnings.push(
        issue(
          "warning",
          "precision_stock_quantity",
          `${scaled} ${stockUnit.unit} has more than ${COLUMN_SCALE.stockQuantity} decimals; VYRON stores ${stored}, a difference of ${Number(lossInSourceUnit.toFixed(6))} ${stockUnit.sourceUnit || stockUnit.unit}.`,
          "quantity"
        )
      );
    }
    const item: PlanItem = {
      stage: "K_opening_stock",
      sourceKey,
      sources: [row.ref],
      action: "create" as const,
      classification: cls,
      proposed: {
        product_key: `product:${key}`,
        quantity: Number(scaled),
        unit: stockUnit.unit,
        unit_cost: unitCost,
        cost_evidence: evidence.class,
        location: row.location,
        label,
        source_quantity: describe(row.quantity),
        source_unit: stockUnit.sourceUnit || null,
      },
      issues: warnings,
    };
    const existing = existingOpeningBalance(sourceKey, `product:${key}`);
    if (existing.status === "ambiguous") {
      return { ...item, action: "exception" as const, issues: [...warnings, issue("exception", "ambiguous_target", existing.detail)] };
    }
    return existing.status === "matched" ? { ...item, action: "match" as const, matchRule: existing.rule, targetId: existing.stockItemId } : item;
  });
  put("K_opening_stock", openingItems);
  const openingByKey = new Map(openingItems.filter((i) => i.action === "create" || i.action === "match").map((i) => [String((i.proposed as Record<string, unknown>).product_key), i]));

  /* ====================================================== L / M purchase orders */
  type Order = { number: string; lines: PurchaseOrderLineRecord[] };
  const orders = new Map<string, Order>();
  for (const line of sources.purchaseOrderLines) {
    const order = orders.get(line.orderNumber) || { number: line.orderNumber, lines: [] };
    order.lines.push(line);
    orders.set(line.orderNumber, order);
  }
  const openOrders: PlanItem[] = [];
  const historicalOrders: PlanItem[] = [];
  for (const order of orders.values()) {
    order.lines.sort((a, b) => a.ref.row - b.ref.row);
    const statuses = [...new Set(order.lines.map((l) => l.inventoryStatus))].sort();
    const cancelled = order.lines.some((l) => l.isCancelled === true);
    const quote = order.lines.some((l) => l.isQuote === true);
    const fulfilled = statuses.every((s) => normalizeName(s) === "fulfilled");
    const refs = order.lines.map((l) => l.ref);
    const vendor = order.lines.find((l) => l.vendor)?.vendor ?? "";
    const summary = { order_number: order.number, vendor, order_date: order.lines[0]?.orderDate ?? "", inventory_status: statuses.join("+"), payment_status: [...new Set(order.lines.map((l) => l.paymentStatus))].join("+"), lines: order.lines.filter((l) => l.productName).length };
    if (!fulfilled && !cancelled && !quote) {
      openOrders.push({ stage: "L_open_purchase_orders", sourceKey: `po:${order.number}`, sources: refs, action: "exception", proposed: summary, issues: [issue("exception", "open_po_review", "Genuinely outstanding order: needs confirmation with the client before it becomes a live commitment.")] });
    } else {
      historicalOrders.push({
        stage: "M_historical_purchase_orders",
        sourceKey: `po:${order.number}`,
        sources: refs,
        action: "skip",
        classification: cancelled ? "historical_cancelled" : quote ? "historical_quote" : "historical_fulfilled",
        proposed: summary,
        issues: pseudoVendor(vendor) ? [issue("warning", "pseudo_vendor_order", `Raised against "${vendor}", which records stock adjustments, not purchases.`)] : [],
      });
    }
  }
  put("L_open_purchase_orders", openOrders);
  put("M_historical_purchase_orders", historicalOrders);

  /* ===================================================== demo readiness */
  const demoReadiness: DemoReadiness[] = [];
  for (const item of stages.F_finished_goods.items) {
    if (item.classification !== "finished_good") continue;
    const proposed = (item.proposed || {}) as Record<string, unknown>;
    const key = item.sourceKey.replace(/^product:/, "");
    const product = sources.products.find((p) => productKey(p) === key);
    const reasons: string[] = [];
    if (item.action === "exception") reasons.push("Product identity is an exception.");
    if (!product?.sku.trim()) reasons.push("No SKU — identity rests on the name.");
    if (proposed.variant) reasons.push("Half-size variant.");
    if (item.issues.some((i) => i.code === "sku_differs_from_product_range")) reasons.push("SKU disagrees between inFlow and the Product Range sheet.");
    if (proposed.product_status === "Discontinued") reasons.push("Discontinued (questionnaire 03.26).");
    if (proposed.selling_price === null || proposed.selling_price === undefined) reasons.push("Selling price unresolved.");
    const bom = bomByProductKey.get(key);
    if (!bom) reasons.push("No BOM planned.");
    else if (bom.action === "exception") reasons.push(`BOM is an exception: ${bom.issues.filter((i) => i.severity === "exception").map((i) => i.code).join(", ")}.`);
    else {
      for (const line of ((bom.proposed as Record<string, unknown>).lines as Record<string, unknown>[]) || []) {
        if (line.cost_evidence !== "po_confirmed" && line.cost_evidence !== "average_matches_workbook") {
          reasons.push(`Component "${line.component_name}" cost is ${line.cost_evidence ?? "missing"}.`);
        }
        const opening = openingByKey.get(String(line.component_key));
        const quantity = Number(line.quantity || 0);
        const onHand = opening ? Number((opening.proposed as Record<string, unknown>).quantity || 0) : 0;
        if (!opening || onHand < quantity) reasons.push(`Component "${line.component_name}" has no opening stock for one unit (${onHand} ${line.unit} on hand, ${quantity} needed).`);
      }
    }
    if (item.issues.some((i) => i.severity === "unresolved")) reasons.push("Unresolved values on the product record.");
    demoReadiness.push({ productKey: key, productName: String(proposed.product_name || product?.name || key), sku: product?.sku || "", ready: reasons.length === 0, reasons: [...new Set(reasons)] });
  }
  demoReadiness.sort((a, b) => (a.productKey < b.productKey ? -1 : a.productKey > b.productKey ? 1 : 0));

  // Stages in implementation order (A → M), whatever order they were planned in.
  const orderedStages = Object.fromEntries(
    (Object.keys(STAGE_TABLES) as StageName[]).map((stage) => [stage, stages[stage]])
  ) as FoodSockPlan["stages"];

  const body = { version: FOOD_SOCK_PLAN_VERSION, target: { companyId: target.companyId }, sources: sources.files.map((f) => ({ key: f.key, sha256: f.sha256 })), stages: orderedStages, demoReadiness };
  return {
    version: FOOD_SOCK_PLAN_VERSION,
    tenant: FOOD_SOCK_TENANT,
    target: { companyId: target.companyId, mode: target.companyId ? "existing_tenant" : "new_tenant" },
    sources: sources.files,
    stages: orderedStages,
    demoReadiness,
    planHash: stableHash(body),
  };
}
