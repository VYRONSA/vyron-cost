import type { UatCatalogue } from "@/lib/order-engine/uat/food-sock-uat";

/**
 * Catalogue validation for a UAT snapshot.
 *
 * This answers one question before any scenario is run: **is the catalogue
 * good enough to order from, and where is it not?**
 *
 * Every finding is classified, because the three kinds need three different
 * people:
 *
 *   DATA      — the catalogue itself is incomplete (a product with no SKU, a
 *               BOM with no components). Fixed in the data, by the business.
 *   DECISION  — the engine needs a business decision before it can act (no
 *               customer price, no mapping for a customer's own code). Fixed
 *               in Order rules, by the business.
 *   ENGINEERING — the snapshot is malformed in a way no business action can
 *               fix (a BOM line pointing at a BOM that is not in the file).
 *
 * A data-quality finding is never reported as a defect in the application, and
 * the reverse. Nothing here reads a database: it works on the supplied file.
 */

export type FindingKind = "DATA" | "DECISION" | "ENGINEERING";

export type CatalogueFinding = {
  code: string;
  kind: FindingKind;
  /** What it is about — a product, a customer, a BOM. */
  entity: string;
  /** The identifier as the snapshot gives it (never a person's details). */
  reference: string;
  detail: string;
};

export type CatalogueReport = {
  counts: {
    products: number;
    activeProducts: number;
    discontinuedProducts: number;
    withSku: number;
    withCost: number;
    withStock: number;
    withBom: number;
    components: number;
    bomLines: number;
    stockItems: number;
    customers: number;
    customerPrices: number;
    customerRules: number;
    packSizes: number;
    aliases: number;
    customerIdentities: number;
  };
  coverage: {
    /** Percentage of active products that have each thing. */
    sku: number;
    cost: number;
    stock: number;
    bom: number;
    packSize: number;
    /** Percentage of customers that have a price list assignment / ordering rule. */
    customerPricing: number;
    customerRules: number;
  };
  findings: CatalogueFinding[];
  byKind: Record<FindingKind, number>;
  byCode: Record<string, number>;
  /** True when nothing would stop an order being validated against this catalogue. */
  orderable: boolean;
};

/**
 * The Food Sock catalogue as migrated and reconciled in the controlled
 * migration run. A supplied snapshot is reconciled against these figures so a
 * partial or unexpected extract is noticed before UAT is run on it.
 *
 * These are counts only, recorded from that run. No Food Sock record, name,
 * price or customer is held here, and nothing reads Food Sock production.
 */
export const FOOD_SOCK_MIGRATED_SCOPE = {
  finishedProducts: 31,
  boms: 31,
  bomLines: 348,
  components: 51,
  stockItems: 82,
  suppliers: 16,
  categories: 8,
} as const;

export type ScopeComparison = Array<{ item: string; expected: number; found: number; matches: boolean }>;

/** Compare a snapshot with the known migrated scope. Reporting only: nothing is changed. */
export function compareWithMigratedScope(report: CatalogueReport): ScopeComparison {
  const rows: Array<[string, number, number]> = [
    ["finished products", FOOD_SOCK_MIGRATED_SCOPE.finishedProducts, report.counts.products],
    ["BOMs", FOOD_SOCK_MIGRATED_SCOPE.boms, report.counts.withBom],
    ["BOM lines", FOOD_SOCK_MIGRATED_SCOPE.bomLines, report.counts.bomLines],
    ["components", FOOD_SOCK_MIGRATED_SCOPE.components, report.counts.components],
    ["stock items", FOOD_SOCK_MIGRATED_SCOPE.stockItems, report.counts.stockItems],
  ];
  return rows.map(([item, expected, found]) => ({ item, expected, found, matches: expected === found }));
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value).trim());

/** A product the snapshot marks as discontinued / inactive. */
function isActive(product: Record<string, unknown>): boolean {
  if (product.active === false) return false;
  const status = text(product.status).toLowerCase();
  if (status && ["discontinued", "inactive", "archived", "obsolete"].includes(status)) return false;
  return true;
}

/**
 * Validate a catalogue snapshot. Returns everything found; the caller decides
 * what to do about it. Never throws on bad data — bad data is the output.
 */
export function validateCatalogue(catalogue: UatCatalogue): CatalogueReport {
  const findings: CatalogueFinding[] = [];
  const add = (code: string, kind: FindingKind, entity: string, reference: string, detail: string) => findings.push({ code, kind, entity, reference, detail });

  const products = (catalogue.products || []) as Array<Record<string, unknown>>;
  const stockItems = (catalogue.stockItems || []) as Array<Record<string, unknown>>;
  const boms = (catalogue.boms || []) as Array<Record<string, unknown>>;
  const bomLines = (catalogue.bomLines || []) as Array<Record<string, unknown>>;
  const customers = (catalogue.customers || []) as Array<Record<string, unknown>>;
  const priceItems = (catalogue.priceListItems || []) as Array<Record<string, unknown>>;
  const assignments = (catalogue.priceListAssignments || []) as Array<Record<string, unknown>>;
  const policies = (catalogue.policies || []) as Array<Record<string, unknown>>;
  const packSizes = (catalogue.packSizes || []) as Array<Record<string, unknown>>;
  const aliases = (catalogue.productAliases || []) as Array<Record<string, unknown>>;
  const identities = (catalogue.customerIdentities || []) as Array<Record<string, unknown>>;

  const productById = new Map(products.map((p) => [text(p.id), p]));
  const active = products.filter(isActive);
  const bomsByProduct = new Map<string, number>();
  for (const bom of boms) bomsByProduct.set(text(bom.product_id), (bomsByProduct.get(text(bom.product_id)) || 0) + 1);
  const linesByBom = new Map<string, number>();
  for (const line of bomLines) linesByBom.set(text(line.bom_id), (linesByBom.get(text(line.bom_id)) || 0) + 1);
  const stockByEntity = new Set(stockItems.map((s) => text(s.entity_id)));
  const packByProduct = new Set(packSizes.filter((p) => Number(p.units_per_box) > 0).map((p) => text(p.product_id)));

  // ---- products ------------------------------------------------------------
  const skuSeen = new Map<string, string[]>();
  for (const product of products) {
    const reference = text(product.sku) || text(product.product_name) || text(product.id);
    const sku = text(product.sku).toUpperCase().replace(/[\s_-]+/g, "");
    if (!text(product.sku)) {
      add("MISSING_SKU", "DATA", "product", reference, "No SKU: an order line can only reach this product by its exact name.");
    } else {
      skuSeen.set(sku, [...(skuSeen.get(sku) || []), reference]);
    }
    if (!isActive(product)) {
      add("INACTIVE_PRODUCT", "DATA", "product", reference, "Discontinued or inactive: an order for it will stop for a person.");
      continue; // the checks below are about products that can still be sold
    }
    if (!(Number(product.total_cost) > 0)) {
      add("MISSING_COST", "DATA", "product", reference, "No cost: margin cannot be measured, so a margin rule cannot be applied.");
    }
    if (!stockByEntity.has(text(product.id))) {
      add("MISSING_STOCK", "DATA", "product", reference, "No stock record: availability is not measured for this product.");
    }
    const bomCount = bomsByProduct.get(text(product.id)) || 0;
    if (bomCount === 0) {
      add("MISSING_BOM", "DATA", "product", reference, "No BOM: a shortfall cannot be turned into a production requirement.");
    } else if (bomCount > 1) {
      add("AMBIGUOUS_BOM", "DATA", "product", reference, `${bomCount} BOMs: the engine will not choose between them.`);
    }
    if (!(Number(product.selling_price) > 0)) {
      add("MISSING_SELLING_PRICE", "DECISION", "product", reference, "No list price: an order line's price cannot be checked against anything.");
    }
  }
  for (const [sku, references] of skuSeen) {
    if (references.length > 1) {
      add("DUPLICATE_SKU", "DATA", "product", references.join(" / "), `${references.length} products share the SKU "${sku}": a line quoting it is ambiguous and will stop.`);
    }
  }

  // ---- BOMs and components -------------------------------------------------
  const bomIds = new Set(boms.map((b) => text(b.id)));
  for (const bom of boms) {
    const reference = text(bom.bom_name) || text(bom.id);
    if (!linesByBom.get(text(bom.id))) {
      add("BOM_WITHOUT_COMPONENTS", "DATA", "bom", reference, "A BOM with no components: its cost is unsubstantiated and no requirement can be worked out.");
    }
    if (text(bom.product_id) && !productById.has(text(bom.product_id))) {
      add("BOM_PRODUCT_NOT_IN_SNAPSHOT", "ENGINEERING", "bom", reference, "The BOM's product is not in this snapshot: the extract is incomplete.");
    }
  }
  const componentIds = new Set<string>();
  for (const line of bomLines) {
    const reference = text(line.line_name) || text(line.id);
    if (!bomIds.has(text(line.bom_id))) {
      add("BOM_LINE_WITHOUT_BOM", "ENGINEERING", "bom line", reference, "The line's BOM is not in this snapshot: the extract is incomplete.");
      continue;
    }
    const component = text(line.ingredient_id) || text(line.component_id);
    if (!component) {
      add("MISSING_COMPONENT", "DATA", "bom line", reference, "The line names no component: it cannot be checked against stock.");
      continue;
    }
    componentIds.add(component);
    if (!stockByEntity.has(component)) {
      add("COMPONENT_WITHOUT_STOCK", "DATA", "bom line", reference, "The component has no stock record: a shortfall cannot be measured.");
    }
    if (!(Number(line.quantity) > 0)) {
      add("COMPONENT_WITHOUT_QUANTITY", "DATA", "bom line", reference, "The line has no quantity: it contributes nothing to a requirement.");
    }
  }

  // ---- customers, pricing, rules, mappings ---------------------------------
  const assignedCustomers = new Set(assignments.map((a) => text(a.customer_id)));
  const ruledCustomers = new Set(policies.map((p) => text(p.customer_id)).filter(Boolean));
  const nameSeen = new Map<string, number>();
  for (const customer of customers) {
    const reference = text(customer.id);
    const name = text(customer.customer_name).toLowerCase().replace(/\s+/g, " ");
    if (name) nameSeen.set(name, (nameSeen.get(name) || 0) + 1);
    if (!name) add("MISSING_CUSTOMER_NAME", "DATA", "customer", reference, "No name: an order naming this customer cannot be matched to it.");
    if (!assignedCustomers.has(reference)) {
      add("MISSING_CUSTOMER_PRICE", "DECISION", "customer", reference, "No price list: orders from this customer are checked against the list price.");
    }
    if (!ruledCustomers.has(reference)) {
      add("MISSING_CUSTOMER_RULES", "DECISION", "customer", reference, "No ordering rules: no PO, delivery date, case or margin rule is applied (D5).");
    }
  }
  for (const [name, count] of nameSeen) {
    if (count > 1) {
      add("AMBIGUOUS_CUSTOMER_NAME", "DATA", "customer", `${count} × "${name}"`, "Two or more customers share this name: an order naming it will stop as ambiguous.");
    }
  }

  const aliasSeen = new Map<string, Set<string>>();
  for (const alias of aliases) {
    const key = `${text(alias.customer_id) || "any customer"}:${text(alias.source_code_normalized) || text(alias.source_item_code)}`;
    const target = text(alias.product_id);
    if (!target || !productById.has(target)) {
      add("MAPPING_WITHOUT_PRODUCT", "DATA", "mapping", key, "The mapping points at a product that is not in this snapshot.");
      continue;
    }
    aliasSeen.set(key, (aliasSeen.get(key) || new Set()).add(target));
  }
  for (const [key, targets] of aliasSeen) {
    if (targets.size > 1) add("AMBIGUOUS_MAPPING", "DATA", "mapping", key, `The same code maps to ${targets.size} products: it will never be used.`);
  }
  for (const identity of identities) {
    if (!text(identity.customer_id)) {
      add("MISSING_CUSTOMER_MAPPING", "DATA", "mapping", text(identity.external_reference) || text(identity.id), "A remembered customer reference points at no customer.");
    }
  }

  const counts: CatalogueReport["counts"] = {
    products: products.length,
    activeProducts: active.length,
    discontinuedProducts: products.length - active.length,
    withSku: products.filter((p) => text(p.sku)).length,
    withCost: products.filter((p) => Number(p.total_cost) > 0).length,
    withStock: products.filter((p) => stockByEntity.has(text(p.id))).length,
    withBom: boms.length,
    components: componentIds.size,
    bomLines: bomLines.length,
    stockItems: stockItems.length,
    customers: customers.length,
    customerPrices: priceItems.length,
    customerRules: policies.length,
    packSizes: packSizes.length,
    aliases: aliases.length,
    customerIdentities: identities.length,
  };

  const byKind: Record<FindingKind, number> = { DATA: 0, DECISION: 0, ENGINEERING: 0 };
  const byCode: Record<string, number> = {};
  for (const finding of findings) {
    byKind[finding.kind] += 1;
    byCode[finding.code] = (byCode[finding.code] || 0) + 1;
  }

  return {
    counts,
    coverage: {
      sku: pct(active.filter((p) => text(p.sku)).length, active.length),
      cost: pct(active.filter((p) => Number(p.total_cost) > 0).length, active.length),
      stock: pct(active.filter((p) => stockByEntity.has(text(p.id))).length, active.length),
      bom: pct(active.filter((p) => (bomsByProduct.get(text(p.id)) || 0) === 1).length, active.length),
      packSize: pct(active.filter((p) => packByProduct.has(text(p.id))).length, active.length),
      customerPricing: pct(customers.filter((c) => assignedCustomers.has(text(c.id))).length, customers.length),
      customerRules: pct(customers.filter((c) => ruledCustomers.has(text(c.id))).length, customers.length),
    },
    findings,
    byKind,
    byCode,
    // A catalogue is orderable when nothing in it is malformed and at least one
    // active product can be ordered: named, priced and identifiable.
    orderable:
      byKind.ENGINEERING === 0 &&
      active.some((p) => text(p.sku) && Number(p.selling_price) > 0 && stockByEntity.has(text(p.id))),
  };
}
