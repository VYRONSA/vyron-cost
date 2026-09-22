import type { WooOrder } from "@/lib/order-engine/adapters/platforms";
import type { CanonicalOrderExtraction } from "@/lib/order-engine/extraction";
import type { OrderCandidate } from "@/lib/order-engine/types";

/**
 * FOOD SOCK UAT — fictional orders only.
 *
 * Nothing here is Food Sock data and nothing here is ever written to Food
 * Sock's production tenant. Two parts:
 *
 *  1. A catalogue: by default a FICTIONAL, Food Sock-shaped catalogue (frozen
 *     meals, BOMs, components, stock) so the scenarios run anywhere with no
 *     client data. In a UAT environment the same scenarios can be generated
 *     from a snapshot of the tenant's own migrated catalogue (products, stock,
 *     BOMs) — the generator picks products by rule, never by name.
 *  2. An overlay: fictional customers ("… (UAT)"), their fictional ordering
 *     rules and the UAT ordering settings. These are test fixtures, NOT Food
 *     Sock's customer policies — those are open decisions
 *     (docs/order-engine/FOOD_SOCK_OPEN_DECISIONS.md).
 *
 * Every scenario is deterministic: fixed ids, a fixed "today", products chosen
 * by sorted SKU and stock/BOM facts.
 */

/** The fictional UAT tenant. Deliberately NOT Food Sock's company id. */
export const FOOD_SOCK_UAT_COMPANY_ID = "f5000000-0000-4000-8000-00000000c0de";
export const FOOD_SOCK_UAT_WORKSPACE_ID = "f5000000-0000-4000-8000-00000000a0a0";
export const FOOD_SOCK_UAT_TODAY = "2026-10-06";

type Row = Record<string, unknown>;

export type UatCatalogue = {
  products: Array<{ id: string; product_name: string; sku: string | null; selling_price: number | null; total_cost: number | null }>;
  stockItems: Row[];
  boms: Row[];
  bomLines: Row[];
  /**
   * Optional parts of a snapshot taken from a NON-PRODUCTION environment: the
   * tenant's own customers, customer pricing, ordering rules and pack sizes.
   * When present the scenarios also prove customer pricing and rules against
   * that data; when absent the fictional overlay is used on its own.
   */
  customers?: Array<{ id: string; customer_name: string | null; status?: string | null; active?: boolean | null }>;
  priceLists?: Row[];
  priceListVersions?: Row[];
  priceListAssignments?: Row[];
  priceListItems?: Array<{ id?: string; price_list_id: string; product_id: string; final_price: number | null; status?: string | null; effective_from?: string | null }>;
  policies?: Row[];
  packSizes?: Row[];
  /** Customers' own item codes, already approved as mappings (never guessed). */
  productAliases?: Row[];
  /** Remembered external customer references (web store, accounting system). */
  customerIdentities?: Row[];
  /** Where the snapshot came from — printed by the runner, never guessed. */
  meta?: { source?: string | null; takenAt?: string | null; environment?: string | null; classification?: string | null };
};

export const SNAPSHOT_REQUIRED_KEYS = ["products", "stockItems", "boms", "bomLines"] as const;
export const SNAPSHOT_OPTIONAL_KEYS = [
  "customers",
  "priceLists",
  "priceListVersions",
  "priceListAssignments",
  "priceListItems",
  "policies",
  "packSizes",
  "productAliases",
  "customerIdentities",
] as const;

/**
 * The classification a snapshot must carry. A file that does not say, in its
 * own contents, that it came from a non-production source is refused: a UAT
 * run must never be able to start from something that might be production.
 */
export const SNAPSHOT_CLASSIFICATION = "NON-PRODUCTION / UAT";
const PRODUCTION_WORDS = /\bprod(uction)?\b|\blive\b/i;

/**
 * Read a catalogue snapshot file (already exported from a NON-PRODUCTION
 * environment) and re-home it onto the fictional UAT tenant. Nothing here
 * connects to any database: the snapshot is supplied as a file, produced by
 * whoever holds the non-production copy. There is no exporter in this
 * repository that queries a live tenant, and there must not be one.
 */
export function loadUatSnapshot(raw: unknown, companyId = FOOD_SOCK_UAT_COMPANY_ID): UatCatalogue {
  if (!raw || typeof raw !== "object") throw new Error("A catalogue snapshot must be a JSON object.");
  const input = raw as Record<string, unknown>;

  // The file must classify itself, and must not claim to be production.
  const meta = (input.meta || {}) as Record<string, unknown>;
  const classification = String(input.classification ?? meta.classification ?? "").trim();
  if (!classification) {
    throw new Error(`A catalogue snapshot must carry "classification": "${SNAPSHOT_CLASSIFICATION}". Nothing unclassified is loaded.`);
  }
  if (classification.toUpperCase() !== SNAPSHOT_CLASSIFICATION) {
    throw new Error(`A catalogue snapshot must be classified "${SNAPSHOT_CLASSIFICATION}", not "${classification}".`);
  }
  const environment = String(meta.environment ?? "").trim();
  if (!environment) throw new Error('A catalogue snapshot must state the environment it came from (meta.environment), for example "uat-restore".');
  if (PRODUCTION_WORDS.test(environment)) {
    throw new Error(`A catalogue snapshot from "${environment}" is refused: UAT is never run from a production extract.`);
  }

  for (const key of SNAPSHOT_REQUIRED_KEYS) {
    if (!Array.isArray(input[key])) throw new Error(`Catalogue snapshot is missing "${key}".`);
  }
  if (!(input.products as unknown[]).length) throw new Error("Catalogue snapshot has no products.");
  const rehome = (rows: unknown): Row[] => (Array.isArray(rows) ? rows.map((r) => ({ ...(r as Row), company_id: companyId })) : []);
  const snapshot: UatCatalogue = {
    products: rehome(input.products) as UatCatalogue["products"],
    stockItems: rehome(input.stockItems),
    boms: rehome(input.boms),
    bomLines: rehome(input.bomLines),
    meta: { ...(input.meta as UatCatalogue["meta"]), classification },
  };
  for (const key of SNAPSHOT_OPTIONAL_KEYS) {
    if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error(`Catalogue snapshot: "${key}" must be a list.`);
    if (Array.isArray(input[key])) (snapshot as Record<string, unknown>)[key] = rehome(input[key]);
  }
  return snapshot;
}

/** What a snapshot can prove, for the runner's banner. */
export function snapshotCoverage(catalogue: UatCatalogue) {
  return {
    products: catalogue.products.length,
    stockItems: catalogue.stockItems.length,
    boms: catalogue.boms.length,
    bomLines: catalogue.bomLines.length,
    customers: catalogue.customers?.length ?? 0,
    customerPrices: catalogue.priceListItems?.length ?? 0,
    customerRules: catalogue.policies?.length ?? 0,
    packSizes: catalogue.packSizes?.length ?? 0,
    aliases: catalogue.productAliases?.length ?? 0,
    customerIdentities: catalogue.customerIdentities?.length ?? 0,
  };
}

const id = (block: string, n: number) => `f5${block}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A fictional catalogue shaped like a ready-meal manufacturer's. */
export function fictionalFoodSockCatalogue(companyId = FOOD_SOCK_UAT_COMPANY_ID): UatCatalogue {
  const meals = [
    { n: 1, name: "UAT Butter Chicken Meal 350g", sku: "UAT-FSM-001", price: 72, cost: 31.4, stock: 180, bom: true },
    { n: 2, name: "UAT Beef Lasagne Meal 400g", sku: "UAT-FSM-002", price: 79, cost: 35.2, stock: 12, bom: true },
    { n: 3, name: "UAT Vegetable Curry Meal 350g", sku: "UAT-FSM-003", price: 64, cost: 26.8, stock: 95, bom: true },
    { n: 4, name: "UAT Chicken Stir-Fry Meal 350g", sku: "UAT-FSM-004", price: 69, cost: 29.9, stock: 0, bom: true },
    { n: 5, name: "UAT Cottage Pie Meal 400g", sku: "UAT-FSM-005", price: 74, cost: 33.1, stock: 140, bom: true },
    { n: 6, name: "UAT Meal Variety Bundle x6", sku: "UAT-FSB-006", price: 399, cost: 188, stock: 8, bom: false },
    { n: 7, name: "UAT Bone Broth 500ml", sku: "UAT-FSD-007", price: 58, cost: 21, stock: 60, bom: false },
  ];
  const components = [
    { n: 1, name: "UAT Chicken thigh", unit: "kg", stock: 40 },
    { n: 2, name: "UAT Basmati rice", unit: "kg", stock: 25 },
    { n: 3, name: "UAT Beef mince", unit: "kg", stock: 3 },
    { n: 4, name: "UAT Pasta sheets", unit: "kg", stock: 10 },
    { n: 5, name: "UAT Meal tray + lid", unit: "each", stock: 900 },
    { n: 6, name: "UAT Mixed vegetables", unit: "kg", stock: 30 },
  ];
  const products = meals.map((m) => ({ id: id("f", m.n), company_id: companyId, product_name: m.name, sku: m.sku, selling_price: m.price, total_cost: m.cost }));
  const stockItems: Row[] = [
    ...meals.map((m) => ({ id: id("5", m.n), company_id: companyId, entity_type: "finished_goods", entity_id: id("f", m.n), qty_on_hand: m.stock, unit: "each" })),
    ...components.map((c) => ({ id: id("5", 100 + c.n), company_id: companyId, entity_type: "ingredient", entity_id: id("1", c.n), qty_on_hand: c.stock, unit: c.unit })),
  ];
  const recipe: Record<number, Array<[number, number, number]>> = {
    // meal n → [component n, quantity per meal, wastage %]
    1: [[1, 0.18, 5], [2, 0.12, 2], [5, 1, 0]],
    2: [[3, 0.16, 5], [4, 0.09, 3], [5, 1, 0]],
    3: [[6, 0.22, 4], [2, 0.12, 2], [5, 1, 0]],
    4: [[1, 0.15, 5], [6, 0.12, 4], [5, 1, 0]],
    5: [[3, 0.14, 5], [6, 0.1, 4], [5, 1, 0]],
  };
  const boms: Row[] = [];
  const bomLines: Row[] = [];
  let lineN = 0;
  for (const m of meals.filter((x) => x.bom)) {
    boms.push({ id: id("b", m.n), company_id: companyId, product_id: id("f", m.n), bom_name: `${m.name} recipe`, yield_qty: 1 });
    for (const [c, qty, wastage] of recipe[m.n]) {
      const comp = components.find((x) => x.n === c)!;
      bomLines.push({
        id: id("7", ++lineN),
        company_id: companyId,
        bom_id: id("b", m.n),
        ingredient_id: id("1", c),
        line_name: comp.name,
        line_type: comp.unit === "each" ? "packaging" : "ingredient",
        quantity: qty,
        unit: comp.unit,
        wastage_percent: wastage,
        sort_order: lineN,
      });
    }
  }
  return { products, stockItems, boms, bomLines };
}

/**
 * How a fixture records an activation.
 *
 * Seeds write channel rows directly, because a fixture is a tenant that has
 * already been through activation. The words below make that unmistakable: no
 * real person activated these channels, and no real UAT run produced this
 * evidence. The rules themselves are never relaxed for tests — a seeded row
 * still satisfies every constraint the database and the state machine impose
 * on a real activation (an active channel has a person and a time; testing
 * passed has a reference), which `test-order-engine-activation.mjs` asserts.
 */
export const FICTIONAL_ACTIVATION = {
  activated_by: "FICTIONAL-UAT-FIXTURE (not a person)",
  uat_reference: "FICTIONAL-UAT-FIXTURE (no real UAT run)",
} as const;

/**
 * The products a scenario uses, chosen by rule so the same scenarios run
 * against a real catalogue snapshot: sorted by SKU, then by stock and BOM
 * facts. Never by name.
 */
export type UatProduct = UatCatalogue["products"][number];

/**
 * Stands in for a product profile the catalogue cannot supply. A scenario
 * built on it is never run: it is reported as blocked, with what was missing.
 */
export const UNAVAILABLE_PRODUCT: UatProduct = {
  id: "__unavailable__",
  product_name: "(no product in this catalogue fits this scenario)",
  sku: "__UNAVAILABLE__",
  selling_price: 1,
  total_cost: 0.5,
};

export function pickUatProducts(catalogue: UatCatalogue, options: { strict?: boolean } = {}) {
  const onHand = (productId: string) =>
    catalogue.stockItems
      .filter((s) => s.entity_type === "finished_goods" && s.entity_id === productId)
      .reduce((sum, s) => sum + Number(s.qty_on_hand || 0), 0);
  const hasStockRecord = (productId: string) => catalogue.stockItems.some((s) => s.entity_type === "finished_goods" && s.entity_id === productId);
  const hasBom = (productId: string) => catalogue.boms.filter((b) => b.product_id === productId).length === 1;
  const priced = catalogue.products
    .filter((p) => p.sku && Number(p.selling_price) > 0 && Number(p.total_cost) > 0)
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const strict = options.strict !== false;
  const missing: string[] = [];
  const pick = (label: string, rule: (p: UatProduct) => boolean): UatProduct => {
    const found = priced.find(rule);
    if (found) return found;
    if (strict) throw new Error(`UAT catalogue has no product for "${label}".`);
    missing.push(label);
    return UNAVAILABLE_PRODUCT;
  };
  const stocked = pick("in stock and priced", (p) => hasStockRecord(p.id) && onHand(p.id) >= 50);
  const produce = pick("short of stock with exactly one BOM", (p) => hasBom(p.id) && hasStockRecord(p.id) && onHand(p.id) < 50 && p.id !== stocked.id);
  const noBom = pick("without a BOM but with a stock record", (p) => !hasBom(p.id) && hasStockRecord(p.id));
  return { priced, stocked, produce, noBom, onHand, hasStockRecord, hasBom, missing };
}

/** Fictional UAT customers (clearly marked). */
export const UAT_CUSTOMERS = {
  retailNorth: { id: id("c", 1), customer_name: "UAT Retail Buyer North", email: "orders@uat-retail-north.example", status: "Active", active: true },
  chainStore: { id: id("c", 2), customer_name: "UAT Chain Store Group", email: "po@uat-chain.example", status: "Active", active: true },
  tightMargin: { id: id("c", 3), customer_name: "UAT Discount Grocer", status: "Active", active: true },
  twinA: { id: id("c", 4), customer_name: "UAT Twin Deli", status: "Active", active: true },
  twinB: { id: id("c", 5), customer_name: "UAT Twin Deli", status: "Active", active: true },
  webAccount: { id: id("c", 6), customer_name: "UAT Web Store Sales", status: "Active", active: true },
  /** Has a contract price list, and uses its own item codes. */
  contractBuyer: { id: id("c", 7), customer_name: "UAT Contract Wholesaler", email: "buying@uat-contract.example", status: "Active", active: true },
  /** Orders in whole cases only. */
  caseBuyer: { id: id("c", 8), customer_name: "UAT Case Buyer Depot", email: "depot@uat-case.example", status: "Active", active: true },
} as const;

/** A fictional customer's own item code for the product the scenarios use. */
export const UAT_CUSTOMER_ITEM_CODE = "UAT-CUST-CODE-77";
/** The case size the fictional case rule enforces. */
export const UAT_CASE_SIZE = 12;
/** The fictional contract discount off the list price. */
export const UAT_CONTRACT_DISCOUNT = 0.9;

/** The whole UAT tenant as table rows: a catalogue plus the fictional overlay. */
export function foodSockUatSeed(catalogue: UatCatalogue = fictionalFoodSockCatalogue(), companyId = FOOD_SOCK_UAT_COMPANY_ID): Record<string, Row[]> {
  const C = UAT_CUSTOMERS;
  const now = "2026-10-01T00:00:00Z";
  // The product the fictional contract price, case size and customer item code
  // are attached to — the same one the scenarios order.
  const picked = pickUatProducts(catalogue, { strict: false }).stocked;
  const target = picked === UNAVAILABLE_PRODUCT ? null : picked;
  const contractPrice = target && Number(target.selling_price) > 0 ? Math.round(Number(target.selling_price) * UAT_CONTRACT_DISCOUNT * 100) / 100 : null;
  // A fictional contract price list for one fictional customer. Any pricing a
  // snapshot supplies is kept as well, and takes its own precedence.
  const fictionalPricing = target && contractPrice !== null
    ? {
        lists: [{ id: id("d", 1), company_id: companyId, name: "FICTIONAL UAT contract prices", status: "Active", is_default: false, created_at: now, updated_at: now }],
        versions: [{ id: id("d", 2), company_id: companyId, price_list_id: id("d", 1), version_no: 1, status: "Active", effective_from: "2026-01-01", created_at: now, updated_at: now }],
        assignments: [{ id: id("d", 3), company_id: companyId, customer_id: C.contractBuyer.id, contract_price_list_id: id("d", 1), default_price_list_id: null, status: "Active", created_at: now, updated_at: now }],
        items: [{ id: id("d", 4), company_id: companyId, price_list_id: id("d", 1), price_list_version_id: id("d", 2), product_id: target.id, final_price: contractPrice, status: "Active", effective_from: "2026-01-01" }],
      }
    : { lists: [], versions: [], assignments: [], items: [] };
  return {
    vyron_workspaces: [{ id: FOOD_SOCK_UAT_WORKSPACE_ID, company_id: companyId, company_name: "Food Sock UAT (fictional)", default_vat_rate: 15 }],
    // The fictional UAT customers, plus any customers a snapshot supplied.
    vyron_customers: [...Object.values(C).map((c) => ({ ...c, company_id: companyId })), ...(catalogue.customers || []).map((c) => ({ ...c, company_id: companyId }))],
    vyron_cost_products: catalogue.products.map((p) => ({ ...p, company_id: companyId })),
    vyron_cost_stock_items: catalogue.stockItems,
    vyron_cost_boms: catalogue.boms,
    vyron_cost_bom_lines: catalogue.bomLines,
    // A fictional confirmed case size for the scenario product, plus any the
    // snapshot supplied.
    vyron_cost_product_pack_sizes: [
      ...(target ? [{ id: id("e", 1), company_id: companyId, product_id: target.id, units_per_box: UAT_CASE_SIZE, confidence: "Confirmed", created_at: now, updated_at: now }] : []),
      ...(catalogue.packSizes || []),
    ],
    vyron_customer_price_list_assignments: [...fictionalPricing.assignments, ...(catalogue.priceListAssignments || [])],
    vyron_customer_price_list_items: [...fictionalPricing.items, ...((catalogue.priceListItems || []) as Row[])],
    vyron_customer_price_lists: [...fictionalPricing.lists, ...(catalogue.priceLists || [])],
    vyron_customer_price_list_versions: [...fictionalPricing.versions, ...(catalogue.priceListVersions || [])],
    vyron_customer_branches: [],
    // A fictional customer's own item code, already approved as a mapping.
    // Aliases are never guessed: this one exists because a person recorded it.
    vyron_order_product_aliases: [
      ...(target
        ? [{
            id: id("e", 2),
            company_id: companyId,
            customer_id: C.contractBuyer.id,
            source_code: UAT_CUSTOMER_ITEM_CODE,
            source_code_normalized: `sku:${UAT_CUSTOMER_ITEM_CODE.trim().toUpperCase()}`,
            product_id: target.id,
            created_by: FICTIONAL_ACTIVATION.activated_by,
            created_at: now,
            revoked_at: null,
          }]
        : []),
      ...(catalogue.productAliases || []),
    ],
    vyron_order_customer_identities: catalogue.customerIdentities || [],
    // Fictional rules for fictional customers — NOT Food Sock policies.
    vyron_customer_order_policies: [
      { id: id("9", 1), company_id: companyId, customer_id: C.chainStore.id, require_po: true, require_delivery_date: true, min_order_value: null, min_gp_pct: null, enforce_case_quantity: false, delivery_weekdays: null, order_cutoff_time: null, special_instructions: null, updated_by: "uat", created_at: now, updated_at: now },
      { id: id("9", 2), company_id: companyId, customer_id: C.tightMargin.id, require_po: false, require_delivery_date: false, min_order_value: null, min_gp_pct: 40, enforce_case_quantity: false, delivery_weekdays: null, order_cutoff_time: null, special_instructions: null, updated_by: "uat", created_at: now, updated_at: now },
      { id: id("9", 3), company_id: companyId, customer_id: C.caseBuyer.id, require_po: false, require_delivery_date: false, min_order_value: null, min_gp_pct: null, enforce_case_quantity: true, delivery_weekdays: null, order_cutoff_time: null, special_instructions: null, updated_by: "uat", created_at: now, updated_at: now },
      ...(catalogue.policies || []),
    ],
    // The UAT tenant has made the decisions a UAT run needs; the rest stay open.
    vyron_order_engine_settings: [
      {
        company_id: companyId,
        b2c_customer_id: C.webAccount.id,
        product_name_matching: "review",
        duplicate_po_action: "warn",
        min_lead_time_days: null,
        web_orders_mode: "fulfil",
        web_order_statuses: null,
        web_prices_include_tax: null,
        shipping_treatment: null,
        sku_alignment: null,
        creator_can_approve: null,
        pdf_extractor: null,
        updated_by: "uat",
        created_at: now,
        updated_at: now,
      },
    ],
    // Channels of the FICTIONAL tenant, recorded as already activated so the
    // scenarios can run. The activation is marked as a fixture (see
    // FICTIONAL_ACTIVATION): no person activated these and no UAT run produced
    // the evidence. The rows still satisfy every rule a real activation must.
    vyron_order_channel_settings: [
      {
        id: id("8", 1),
        company_id: companyId,
        channel_key: "woocommerce:uat-store",
        channel_type: "web_store",
        label: "FICTIONAL UAT web store",
        enabled: true,
        prices_include_tax: false,
        eligible_statuses: ["processing", "on-hold", "completed"],
        activation_state: "ACTIVE",
        activated_at: now,
        activated_by: FICTIONAL_ACTIVATION.activated_by,
        uat_passed_at: now,
        uat_reference: FICTIONAL_ACTIVATION.uat_reference,
        updated_by: FICTIONAL_ACTIVATION.activated_by,
        created_at: now,
        updated_at: now,
      },
      {
        id: id("8", 2),
        company_id: companyId,
        channel_key: "email",
        channel_type: "email",
        label: "FICTIONAL UAT order inbox",
        enabled: true,
        prices_include_tax: null,
        eligible_statuses: null,
        activation_state: "ACTIVE",
        activated_at: now,
        activated_by: FICTIONAL_ACTIVATION.activated_by,
        uat_passed_at: now,
        uat_reference: FICTIONAL_ACTIVATION.uat_reference,
        updated_by: FICTIONAL_ACTIVATION.activated_by,
        created_at: now,
        updated_at: now,
      },
    ],
    vyron_order_mailboxes: [
      { id: id("a", 1), company_id: companyId, receiving_address: "orders@uat-foodsock.example", label: "UAT order inbox", provider: "uat", status: "ACTIVE", allowed_sender_domains: ["uat-retail-north.example"], allowed_senders: null, max_attachment_bytes: null, allowed_mime_types: null, require_verified_sender: false, updated_by: "uat", created_at: now, updated_at: now },
    ],
    vyron_order_document_extractions: [],
    vyron_import_source_links: [],
    vyron_customer_sales_orders: [],
    vyron_customer_sales_order_lines: [],
    vyron_customer_sales_order_allocations: [],
    vyron_customer_sales_order_audit: [],
    vyron_customer_sales_order_invoice_links: [],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
    vyron_cost_stock_ledger: [],
    vyron_stock_movements: [],
    vyron_xero_sync_queue: [],
    vyron_order_notification_deliveries: [],
    vyron_order_intakes: [],
    vyron_order_intake_lines: [],
    vyron_order_intake_events: [],
    vyron_order_source_messages: [],
  };
}

export type UatInput =
  | { kind: "candidate"; candidate: OrderCandidate }
  | { kind: "woocommerce"; storeKey: string; order: WooOrder }
  | { kind: "extraction"; extraction: CanonicalOrderExtraction; sourceKey: string }
  /** A CSV the customer sent, uploaded by a person. */
  | { kind: "csv"; fileName: string; text: string }
  /** A spreadsheet the customer sent: header row, then one row per line. */
  | { kind: "xlsx"; fileName: string; header: string[]; rows: Array<Array<string | number>> }
  /** A message handed over the e-mail connector boundary (no mailbox is connected). */
  | { kind: "email"; deliveredTo: string; from: string; subject: string; attachment: { fileName: string; contentType: string; text?: string; sizeBytes?: number } };

/**
 * What a scenario should produce. Most produce an order; two produce something
 * else on purpose — a document held because no extractor is configured, and a
 * message quarantined because the sender is outside the mailbox policy.
 */
export type UatExpectation =
  | { outcome?: "ORDER"; status: "AWAITING_APPROVAL" | "EXCEPTION"; codes: string[]; absent?: string[] }
  | { outcome: "DOCUMENT_HELD"; status?: never; codes?: never; absent?: never }
  | { outcome: "QUARANTINED"; status?: never; codes?: never; absent?: never };

export type UatScenario = {
  id: string;
  title: string;
  /** Which channel the order comes in through — shown in the report. */
  channel: "manual" | "csv" | "xlsx" | "email" | "pdf" | "web_store";
  input: UatInput;
  after?: string[];
  expect: UatExpectation;
};

/**
 * How a UAT result is reported. A run that does not do what the scenario says
 * is not automatically a defect: most often the catalogue is missing something
 * or the business has not decided something, and those need different people.
 */
export type UatVerdict = "PASS" | "BLOCKED — BUSINESS DECISION" | "BLOCKED — DATA" | "FAIL — ENGINEERING";

/** Codes that mean the catalogue is missing something, not that the engine is wrong. */
const DATA_CODES = new Set([
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_AMBIGUOUS",
  "CUSTOMER_INACTIVE",
  "PRODUCT_UNMATCHED",
  "PRODUCT_AMBIGUOUS",
  "PRICE_LOOKUP_FAILED",
  "PRICE_MISSING",
  "PRICE_ZERO",
  "PRICE_NEGATIVE",
  "MARGIN_NOT_MEASURED",
  "NO_BOM_FOR_SHORTFALL",
  "INSUFFICIENT_STOCK",
  "DUPLICATE_PRODUCT_LINE",
]);

/** Codes that mean the business has not decided something (a tenant setting or customer rule). */
const DECISION_CODES = new Set([
  "MISSING_PO",
  "MISSING_DELIVERY_DATE",
  "BELOW_MINIMUM_ORDER",
  "DELIVERY_DAY_NOT_ALLOWED",
  "CASE_QUANTITY",
  "LOW_MARGIN",
  "DELIVERY_LEAD_TIME",
  "WEB_ORDERS_MODE_NOT_DECIDED",
  "WEB_STATUS_NOT_ELIGIBLE",
  "WEB_VAT_BASIS_UNKNOWN",
  "B2C_ACCOUNT_NOT_CONFIGURED",
  "PRICES_INCLUDE_TAX",
  "SPECIAL_INSTRUCTIONS",
]);

/**
 * Classify one scenario result. The scenario says what should happen; this says
 * what did, and whose problem it is when they differ.
 */
export function classifyUatResult(
  scenario: UatScenario,
  actual: { outcome: "ORDER" | "DOCUMENT_HELD" | "QUARANTINED" | "ERROR"; status?: string | null; codes?: string[]; error?: string | null }
): { verdict: UatVerdict; reason: string } {
  const expected = scenario.expect;
  const wantedOutcome = expected.outcome || "ORDER";

  if (actual.outcome === "ERROR") {
    // A scenario that cannot even be built from this catalogue is a catalogue
    // problem; anything else that throws is ours.
    const message = actual.error || "The scenario could not be run.";
    return /catalogue has no product|no products|snapshot/i.test(message)
      ? { verdict: "BLOCKED — DATA", reason: message }
      : { verdict: "FAIL — ENGINEERING", reason: message };
  }
  if (actual.outcome !== wantedOutcome) {
    return { verdict: "FAIL — ENGINEERING", reason: `Expected ${wantedOutcome}, got ${actual.outcome}.` };
  }
  if (wantedOutcome !== "ORDER") return { verdict: "PASS", reason: "" };

  const codes = actual.codes || [];
  const missing = (expected.codes || []).filter((code) => !codes.includes(code));
  const present = (expected.absent || []).filter((code) => codes.includes(code));
  const statusMatches = actual.status === expected.status;
  if (statusMatches && !missing.length && !present.length) return { verdict: "PASS", reason: "" };

  // Something unexpected stopped (or failed to stop) the order. Say who owns it.
  const unexpected = codes.filter((code) => !(expected.codes || []).includes(code));
  const blockingData = unexpected.filter((code) => DATA_CODES.has(code));
  const blockingDecision = unexpected.filter((code) => DECISION_CODES.has(code));
  if (blockingData.length) return { verdict: "BLOCKED — DATA", reason: `Catalogue: ${blockingData.join(", ")}.` };
  if (blockingDecision.length) return { verdict: "BLOCKED — BUSINESS DECISION", reason: `Not decided: ${blockingDecision.join(", ")}.` };
  if (missing.length) return { verdict: "FAIL — ENGINEERING", reason: `Expected ${missing.join(", ")}, not raised.` };
  if (present.length) return { verdict: "FAIL — ENGINEERING", reason: `Should not have raised ${present.join(", ")}.` };
  return { verdict: "FAIL — ENGINEERING", reason: `Expected ${expected.status}, got ${actual.status}.` };
}

/**
 * The UAT scenarios for a catalogue. Products are chosen by rule (sorted SKU,
 * stock and BOM facts), so the same scenarios can be generated from a real
 * catalogue snapshot in a UAT environment. Throws if the catalogue cannot
 * supply a scenario's product — a missing scenario is never silently skipped.
 */
export function buildFoodSockUatScenarios(catalogue: UatCatalogue = fictionalFoodSockCatalogue(), options: { strict?: boolean } = {}): UatScenario[] {
  const { priced, stocked, produce, noBom, onHand } = pickUatProducts(catalogue, options);
  const C = UAT_CUSTOMERS;
  const contractPrice = Math.round(Number(stocked.selling_price) * UAT_CONTRACT_DISCOUNT * 100) / 100;
  const base = (fields: Partial<OrderCandidate>): OrderCandidate => ({
    source: "manual",
    context: "B2B",
    sourceChannel: "manual",
    requestedDeliveryDate: "2026-10-14",
    lines: [],
    ...fields,
  });
  const line = (p: { sku: string | null; product_name: string; selling_price: number | null }, quantity: number, unitPrice: number | null = p.selling_price) => ({
    sku: p.sku,
    description: p.product_name,
    quantity,
    unitPrice,
  });

  // When a snapshot supplies customer pricing, prove the contract price is the
  // one the order is validated against.
  const pricedCustomer = (() => {
    const items = catalogue.priceListItems || [];
    const assignments = (catalogue.priceListAssignments || []) as Array<Record<string, unknown>>;
    for (const assignment of assignments) {
      const listId = String(assignment.contract_price_list_id || assignment.default_price_list_id || "");
      const customerId = String(assignment.customer_id || "");
      const customer = (catalogue.customers || []).find((c) => c.id === customerId);
      const item = items.find((i) => String(i.price_list_id) === listId && Number(i.final_price) > 0);
      const product = item ? priced.find((p) => p.id === String(item.product_id)) : undefined;
      if (customer?.customer_name && item && product) return { customer, product, price: Number(item.final_price) };
    }
    return null;
  })();

  return [
    ...(pricedCustomer
      ? [
          {
            id: "snapshot-customer-pricing",
            title: "Customer contract price is the price validated (snapshot pricing)",
            channel: "manual" as const,
            input: {
              kind: "candidate" as const,
              candidate: base({
                customerName: pricedCustomer.customer.customer_name!,
                customerPoNumber: "UAT-PO-9001",
                lines: [line(pricedCustomer.product, 2, pricedCustomer.price)],
              }),
            },
            expect: { status: "AWAITING_APPROVAL" as const, codes: [], absent: ["PRICE_MISMATCH", "CUSTOMER_NOT_FOUND"] },
          },
        ]
      : []),
    {
      id: "valid-b2b",
      title: "Valid B2B order (PO, delivery date, stocked product at list price)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1001", lines: [line(stocked, 24)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["CUSTOMER_NOT_FOUND", "PRODUCT_UNMATCHED", "INSUFFICIENT_STOCK"] },
    },
    {
      id: "valid-b2c",
      title: "Valid B2C web order from an unknown web customer, booked to the configured B2C account",
      channel: "web_store",
      input: {
        kind: "woocommerce",
        storeKey: "uat-store",
        order: {
          id: 50001,
          number: "UAT-WEB-50001",
          status: "processing",
          currency: "ZAR",
          prices_include_tax: false,
          customer_id: 0,
          billing: { email: "shopper@uat-web.example", first_name: "UAT", last_name: "Shopper" },
          line_items: [{ id: 1, product_id: 9001, sku: String(stocked.sku), name: stocked.product_name, quantity: 2, subtotal: String(Number(stocked.selling_price) * 2), total: String(Number(stocked.selling_price) * 2) }],
        },
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["B2C_ACCOUNT_NOT_CONFIGURED", "CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "unknown-sku",
      title: "Unknown SKU",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1002", lines: [{ sku: "UAT-NOT-A-SKU", description: "Something we do not make", quantity: 5, unitPrice: 50 }] }) },
      expect: { status: "EXCEPTION", codes: ["PRODUCT_UNMATCHED"] },
    },
    {
      id: "unknown-customer",
      title: "Unknown customer",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: "UAT Nobody Trading", customerPoNumber: "UAT-PO-1003", lines: [line(stocked, 6)] }) },
      expect: { status: "EXCEPTION", codes: ["CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "duplicate-po",
      title: "Duplicate PO (same customer, same PO as the valid B2B order)",
      channel: "manual",
      after: ["valid-b2b"],
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1001", lines: [line(stocked, 12)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["POSSIBLE_DUPLICATE_PO"] },
    },
    {
      id: "insufficient-stock",
      title: "Insufficient stock on a product without a BOM",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1004", lines: [line(noBom, onHand(noBom.id) + 10)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "NO_BOM_FOR_SHORTFALL"] },
    },
    {
      id: "production-required",
      title: "Production required (BOM exists, component availability shown)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1005", lines: [line(produce, onHand(produce.id) + 25)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "PRODUCTION_REQUIRED"] },
    },
    {
      id: "low-margin",
      title: "Margin below the customer's minimum (fictional 40% rule)",
      channel: "manual",
      input: {
        kind: "candidate",
        candidate: base({ customerName: C.tightMargin.customer_name, lines: [line(stocked, 10, Math.round(Number(stocked.total_cost) * 1.1 * 100) / 100)] }),
      },
      expect: { status: "AWAITING_APPROVAL", codes: ["LOW_MARGIN", "PRICE_MISMATCH"] },
    },
    {
      id: "missing-po",
      title: "Missing PO (customer requires one)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.chainStore.customer_name, lines: [line(stocked, 10)] }) },
      expect: { status: "EXCEPTION", codes: ["MISSING_PO"] },
    },
    {
      id: "missing-delivery-date",
      title: "Missing delivery date (customer requires one)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.chainStore.customer_name, customerPoNumber: "UAT-CH-77", requestedDeliveryDate: null, lines: [line(stocked, 10)] }) },
      expect: { status: "EXCEPTION", codes: ["MISSING_DELIVERY_DATE"] },
    },
    {
      id: "invalid-quantity",
      title: "Invalid quantity (zero)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1006", lines: [line(stocked, 0)] }) },
      expect: { status: "EXCEPTION", codes: ["INVALID_QUANTITY"] },
    },
    {
      id: "ambiguous-mapping",
      title: "Ambiguous mapping (two customers share the name)",
      channel: "manual",
      input: { kind: "candidate", candidate: base({ customerName: "UAT Twin Deli", customerPoNumber: "UAT-TW-1", lines: [line(stocked, 4)] }) },
      expect: { status: "EXCEPTION", codes: ["CUSTOMER_AMBIGUOUS"] },
    },
    {
      id: "low-confidence-extraction",
      title: "Low-confidence document extraction",
      channel: "pdf",
      input: {
        kind: "extraction",
        sourceKey: "uat-doc-0001.pdf",
        extraction: {
          version: 1,
          extractor: { name: "uat-fixture", version: "1", method: "ai" },
          confidence: "LOW",
          document: { fileName: "uat-doc-0001.pdf", contentType: "application/pdf" },
          customer: C.retailNorth.customer_name,
          po_number: "UAT-PO-1007",
          requested_delivery_date: "14/10/2026",
          order_lines: [{ sku: stocked.sku, product_name: stocked.product_name, quantity: "12", unit_price: stocked.selling_price, source_quantity: "12 cases?", confidence: { quantity: { confidence: "LOW", source: "page 1, row 2" } } }],
        },
      },
      expect: { status: "EXCEPTION", codes: ["EXTRACTION_LOW_CONFIDENCE"] },
    },
    {
      id: "contract-price",
      title: "B2B order at the customer's own contract price (not the list price)",
      channel: "manual",
      input: {
        kind: "candidate",
        candidate: base({ customerName: C.contractBuyer.customer_name, customerPoNumber: "UAT-PO-1010", lines: [line(stocked, 8, contractPrice)] }),
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRICE_MISMATCH", "CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "customer-item-code",
      title: "The customer orders with its own item code, mapped by a person beforehand",
      channel: "manual",
      input: {
        kind: "candidate",
        candidate: base({
          customerName: C.contractBuyer.customer_name,
          customerPoNumber: "UAT-PO-1011",
          lines: [{ sku: UAT_CUSTOMER_ITEM_CODE, description: "The customer's own description", quantity: 6, unitPrice: contractPrice }],
        }),
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRODUCT_UNMATCHED"] },
    },
    {
      id: "whole-case",
      title: `Part-case quantity where the customer orders in whole cases of ${UAT_CASE_SIZE}`,
      channel: "manual",
      input: {
        kind: "candidate",
        candidate: base({ customerName: C.caseBuyer.customer_name, customerPoNumber: "UAT-PO-1012", lines: [line(stocked, UAT_CASE_SIZE + 5)] }),
      },
      expect: { status: "AWAITING_APPROVAL", codes: ["CASE_QUANTITY"] },
    },
    {
      id: "csv-order",
      title: "A CSV the customer sent, uploaded by a person",
      channel: "csv",
      input: {
        kind: "csv",
        fileName: "UAT-PO-1013.csv",
        text: [
          "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price",
          `${C.retailNorth.customer_name},UAT-PO-1013,2026-10-15,${stocked.sku},${stocked.product_name},20,${stocked.selling_price}`,
        ].join("\n"),
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRODUCT_UNMATCHED", "CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "xlsx-order",
      title: "A spreadsheet the customer sent, uploaded by a person",
      channel: "xlsx",
      input: {
        kind: "xlsx",
        fileName: "UAT-PO-1014.xlsx",
        header: ["customer", "po_number", "requested_delivery_date", "sku", "description", "quantity", "unit_price"],
        rows: [[C.retailNorth.customer_name, "UAT-PO-1014", "2026-10-15", String(stocked.sku), stocked.product_name, 16, Number(stocked.selling_price)]],
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRODUCT_UNMATCHED", "CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "email-order",
      title: "An order e-mailed to the receiving address, from an allowed sender",
      channel: "email",
      input: {
        kind: "email",
        deliveredTo: "orders@uat-foodsock.example",
        from: "buyer@uat-retail-north.example",
        subject: "PO UAT-PO-1015",
        attachment: {
          fileName: "UAT-PO-1015.csv",
          contentType: "text/csv",
          text: [
            "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price",
            `${C.retailNorth.customer_name},UAT-PO-1015,2026-10-15,${stocked.sku},${stocked.product_name},14,${stocked.selling_price}`,
          ].join("\n"),
        },
      },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRODUCT_UNMATCHED", "CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "email-outside-policy",
      title: "A message from a sender outside the mailbox policy is held, never processed",
      channel: "email",
      input: {
        kind: "email",
        deliveredTo: "orders@uat-foodsock.example",
        from: "stranger@uat-somewhere-else.example",
        subject: "Order?",
        attachment: { fileName: "order.csv", contentType: "text/csv", text: "customer,po_number,sku,quantity\nWhoever,X,Y,1\n" },
      },
      expect: { outcome: "QUARANTINED" },
    },
    {
      id: "pdf-pending-extraction",
      title: "A PDF order with no extractor configured: held, nothing invented",
      channel: "pdf",
      input: {
        kind: "email",
        deliveredTo: "orders@uat-foodsock.example",
        from: "buyer@uat-retail-north.example",
        subject: "PO UAT-PO-1016 (PDF)",
        attachment: { fileName: "UAT-PO-1016.pdf", contentType: "application/pdf", sizeBytes: 24000 },
      },
      expect: { outcome: "DOCUMENT_HELD" },
    },
  ];
}

/**
 * Which product profile each scenario needs. A catalogue that cannot supply one
 * blocks those scenarios and only those — the rest still run, and the blocked
 * ones are reported with what was missing. Nothing is ever silently skipped.
 */
export const SCENARIO_NEEDS: Record<string, Array<"stocked" | "produce" | "noBom">> = {
  "snapshot-customer-pricing": [],
  "valid-b2b": ["stocked"],
  "valid-b2c": ["stocked"],
  "unknown-sku": [],
  "unknown-customer": ["stocked"],
  "duplicate-po": ["stocked"],
  "insufficient-stock": ["noBom"],
  "production-required": ["produce"],
  "low-margin": ["stocked"],
  "missing-po": ["stocked"],
  "missing-delivery-date": ["stocked"],
  "invalid-quantity": ["stocked"],
  "ambiguous-mapping": ["stocked"],
  "low-confidence-extraction": ["stocked"],
  "contract-price": ["stocked"],
  "customer-item-code": ["stocked"],
  "whole-case": ["stocked"],
  "csv-order": ["stocked"],
  "xlsx-order": ["stocked"],
  "email-order": ["stocked"],
  "email-outside-policy": [],
  "pdf-pending-extraction": [],
};

export type BlockedScenario = { id: string; channel: UatScenario["channel"]; title: string; reason: string };

/**
 * The scenarios a catalogue can actually support, and the ones it cannot.
 *
 * A real catalogue may have no product of some shape — for example every
 * product may have a BOM, so there is nothing to test "no BOM for the
 * shortfall" with. That blocks that scenario on the data, and nothing else.
 */
export function buildFoodSockUatPlan(catalogue: UatCatalogue = fictionalFoodSockCatalogue()): { scenarios: UatScenario[]; blocked: BlockedScenario[] } {
  const picks = pickUatProducts(catalogue, { strict: false });
  const unavailable = new Set<string>();
  if (picks.stocked === UNAVAILABLE_PRODUCT) unavailable.add("stocked");
  if (picks.produce === UNAVAILABLE_PRODUCT) unavailable.add("produce");
  if (picks.noBom === UNAVAILABLE_PRODUCT) unavailable.add("noBom");

  const all = buildFoodSockUatScenarios(catalogue, { strict: false });
  const scenarios: UatScenario[] = [];
  const blocked: BlockedScenario[] = [];
  const label = (profile: string) =>
    profile === "stocked" ? "in stock and priced" : profile === "produce" ? "short of stock with exactly one BOM" : "without a BOM but with a stock record";
  for (const scenario of all) {
    const needs = SCENARIO_NEEDS[scenario.id] || [];
    const missing = needs.filter((need) => unavailable.has(need));
    if (missing.length) {
      blocked.push({ id: scenario.id, channel: scenario.channel, title: scenario.title, reason: `This catalogue has no product ${missing.map(label).join(" and ")}.` });
      continue;
    }
    scenarios.push(scenario);
  }
  return { scenarios, blocked };
}
