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
};

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

/** Fictional UAT customers (clearly marked). */
export const UAT_CUSTOMERS = {
  retailNorth: { id: id("c", 1), customer_name: "UAT Retail Buyer North", email: "orders@uat-retail-north.example", status: "Active", active: true },
  chainStore: { id: id("c", 2), customer_name: "UAT Chain Store Group", email: "po@uat-chain.example", status: "Active", active: true },
  tightMargin: { id: id("c", 3), customer_name: "UAT Discount Grocer", status: "Active", active: true },
  twinA: { id: id("c", 4), customer_name: "UAT Twin Deli", status: "Active", active: true },
  twinB: { id: id("c", 5), customer_name: "UAT Twin Deli", status: "Active", active: true },
  webAccount: { id: id("c", 6), customer_name: "UAT Web Store Sales", status: "Active", active: true },
} as const;

/** The whole UAT tenant as table rows: a catalogue plus the fictional overlay. */
export function foodSockUatSeed(catalogue: UatCatalogue = fictionalFoodSockCatalogue(), companyId = FOOD_SOCK_UAT_COMPANY_ID): Record<string, Row[]> {
  const C = UAT_CUSTOMERS;
  const now = "2026-10-01T00:00:00Z";
  return {
    vyron_workspaces: [{ id: FOOD_SOCK_UAT_WORKSPACE_ID, company_id: companyId, company_name: "Food Sock UAT (fictional)", default_vat_rate: 15 }],
    vyron_customers: Object.values(C).map((c) => ({ ...c, company_id: companyId })),
    vyron_cost_products: catalogue.products.map((p) => ({ ...p, company_id: companyId })),
    vyron_cost_stock_items: catalogue.stockItems,
    vyron_cost_boms: catalogue.boms,
    vyron_cost_bom_lines: catalogue.bomLines,
    vyron_cost_product_pack_sizes: [],
    vyron_customer_price_list_assignments: [],
    vyron_customer_price_list_items: [],
    vyron_customer_price_lists: [],
    vyron_customer_price_list_versions: [],
    vyron_customer_branches: [],
    // Fictional rules for fictional customers — NOT Food Sock policies.
    vyron_customer_order_policies: [
      { id: id("9", 1), company_id: companyId, customer_id: C.chainStore.id, require_po: true, require_delivery_date: true, min_order_value: null, min_gp_pct: null, enforce_case_quantity: false, delivery_weekdays: null, order_cutoff_time: null, special_instructions: null, updated_by: "uat", created_at: now, updated_at: now },
      { id: id("9", 2), company_id: companyId, customer_id: C.tightMargin.id, require_po: false, require_delivery_date: false, min_order_value: null, min_gp_pct: 40, enforce_case_quantity: false, delivery_weekdays: null, order_cutoff_time: null, special_instructions: null, updated_by: "uat", created_at: now, updated_at: now },
    ],
    vyron_order_engine_settings: [
      { company_id: companyId, b2c_customer_id: C.webAccount.id, product_name_matching: "review", duplicate_po_action: "warn", min_lead_time_days: null, updated_by: "uat", created_at: now, updated_at: now },
    ],
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
    vyron_order_product_aliases: [],
    vyron_order_customer_identities: [],
  };
}

export type UatInput =
  | { kind: "candidate"; candidate: OrderCandidate }
  | { kind: "woocommerce"; storeKey: string; order: WooOrder }
  | { kind: "extraction"; extraction: CanonicalOrderExtraction; sourceKey: string };

export type UatScenario = {
  id: string;
  title: string;
  input: UatInput;
  after?: string[];
  expect: { status: "AWAITING_APPROVAL" | "EXCEPTION"; codes: string[]; absent?: string[] };
};

/**
 * The UAT scenarios for a catalogue. Products are chosen by rule (sorted SKU,
 * stock and BOM facts), so the same scenarios can be generated from a real
 * catalogue snapshot in a UAT environment. Throws if the catalogue cannot
 * supply a scenario's product — a missing scenario is never silently skipped.
 */
export function buildFoodSockUatScenarios(catalogue: UatCatalogue = fictionalFoodSockCatalogue()): UatScenario[] {
  const onHand = (productId: string) =>
    catalogue.stockItems
      .filter((s) => s.entity_type === "finished_goods" && s.entity_id === productId)
      .reduce((sum, s) => sum + Number(s.qty_on_hand || 0), 0);
  const hasStockRecord = (productId: string) => catalogue.stockItems.some((s) => s.entity_type === "finished_goods" && s.entity_id === productId);
  const hasBom = (productId: string) => catalogue.boms.filter((b) => b.product_id === productId).length === 1;
  const priced = catalogue.products
    .filter((p) => p.sku && Number(p.selling_price) > 0 && Number(p.total_cost) > 0)
    .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  const pick = (label: string, rule: (p: (typeof priced)[number]) => boolean) => {
    const found = priced.find(rule);
    if (!found) throw new Error(`UAT catalogue has no product for "${label}".`);
    return found;
  };
  const stocked = pick("in stock (≥ 50)", (p) => hasStockRecord(p.id) && onHand(p.id) >= 50);
  const produce = pick("BOM, low stock", (p) => hasBom(p.id) && hasStockRecord(p.id) && onHand(p.id) < 50 && p.id !== stocked.id);
  const noBom = pick("no BOM, stock record", (p) => !hasBom(p.id) && hasStockRecord(p.id));
  const C = UAT_CUSTOMERS;
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

  return [
    {
      id: "valid-b2b",
      title: "Valid B2B order (PO, delivery date, stocked product at list price)",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1001", lines: [line(stocked, 24)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["CUSTOMER_NOT_FOUND", "PRODUCT_UNMATCHED", "INSUFFICIENT_STOCK"] },
    },
    {
      id: "valid-b2c",
      title: "Valid B2C web order from an unknown web customer, booked to the configured B2C account",
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
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1002", lines: [{ sku: "UAT-NOT-A-SKU", description: "Something we do not make", quantity: 5, unitPrice: 50 }] }) },
      expect: { status: "EXCEPTION", codes: ["PRODUCT_UNMATCHED"] },
    },
    {
      id: "unknown-customer",
      title: "Unknown customer",
      input: { kind: "candidate", candidate: base({ customerName: "UAT Nobody Trading", customerPoNumber: "UAT-PO-1003", lines: [line(stocked, 6)] }) },
      expect: { status: "EXCEPTION", codes: ["CUSTOMER_NOT_FOUND"] },
    },
    {
      id: "duplicate-po",
      title: "Duplicate PO (same customer, same PO as the valid B2B order)",
      after: ["valid-b2b"],
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1001", lines: [line(stocked, 12)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["POSSIBLE_DUPLICATE_PO"] },
    },
    {
      id: "insufficient-stock",
      title: "Insufficient stock on a product without a BOM",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1004", lines: [line(noBom, onHand(noBom.id) + 10)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "NO_BOM_FOR_SHORTFALL"] },
    },
    {
      id: "production-required",
      title: "Production required (BOM exists, component availability shown)",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1005", lines: [line(produce, onHand(produce.id) + 25)] }) },
      expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "PRODUCTION_REQUIRED"] },
    },
    {
      id: "low-margin",
      title: "Margin below the customer's minimum (fictional 40% rule)",
      input: {
        kind: "candidate",
        candidate: base({ customerName: C.tightMargin.customer_name, lines: [line(stocked, 10, Math.round(Number(stocked.total_cost) * 1.1 * 100) / 100)] }),
      },
      expect: { status: "AWAITING_APPROVAL", codes: ["LOW_MARGIN", "PRICE_MISMATCH"] },
    },
    {
      id: "missing-po",
      title: "Missing PO (customer requires one)",
      input: { kind: "candidate", candidate: base({ customerName: C.chainStore.customer_name, lines: [line(stocked, 10)] }) },
      expect: { status: "EXCEPTION", codes: ["MISSING_PO"] },
    },
    {
      id: "missing-delivery-date",
      title: "Missing delivery date (customer requires one)",
      input: { kind: "candidate", candidate: base({ customerName: C.chainStore.customer_name, customerPoNumber: "UAT-CH-77", requestedDeliveryDate: null, lines: [line(stocked, 10)] }) },
      expect: { status: "EXCEPTION", codes: ["MISSING_DELIVERY_DATE"] },
    },
    {
      id: "invalid-quantity",
      title: "Invalid quantity (zero)",
      input: { kind: "candidate", candidate: base({ customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-1006", lines: [line(stocked, 0)] }) },
      expect: { status: "EXCEPTION", codes: ["INVALID_QUANTITY"] },
    },
    {
      id: "ambiguous-mapping",
      title: "Ambiguous mapping (two customers share the name)",
      input: { kind: "candidate", candidate: base({ customerName: "UAT Twin Deli", customerPoNumber: "UAT-TW-1", lines: [line(stocked, 4)] }) },
      expect: { status: "EXCEPTION", codes: ["CUSTOMER_AMBIGUOUS"] },
    },
    {
      id: "low-confidence-extraction",
      title: "Low-confidence document extraction",
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
  ];
}
