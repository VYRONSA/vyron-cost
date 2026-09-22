import type { OrderCandidate } from "@/lib/order-engine/types";
import type { ShopifyOrder, WooOrder } from "@/lib/order-engine/adapters/platforms";

/**
 * NON-PRODUCTION order fixtures.
 *
 * A fictional food manufacturer, "Harbour Kitchen Foods", with fictional
 * customers and products. Nothing here is, or is derived from, any real
 * client's data (Food Sock included). The same fixtures drive the automated
 * tests (scripts/test-order-engine-fixtures.mjs) and the scripted demo
 * (scripts/order-engine-demo.mjs, docs/order-engine/DEMO_SCRIPT.md).
 *
 * The ids are synthetic and deliberately shaped so they can never collide
 * with a real tenant's generated ids.
 */

export const DEMO_COMPANY_ID = "de300000-0000-4000-8000-00000000c0de";
export const DEMO_WORKSPACE_ID = "de300000-0000-4000-8000-00000000a0a0";
/** The date the scenarios treat as "today" — fixed so every run is identical. */
export const DEMO_TODAY = "2026-09-29";

const CO = DEMO_COMPANY_ID;

export const DEMO_CUSTOMERS = {
  northside: { id: "de3c0000-0000-4000-8000-000000000001", company_id: CO, customer_name: "Northside Grocers", email: "orders@northside-grocers.example", status: "Active", active: true },
  bayStreet: { id: "de3c0000-0000-4000-8000-000000000002", company_id: CO, customer_name: "Bay Street Deli", email: "buying@baystreetdeli.example", status: "Active", active: true },
  cove: { id: "de3c0000-0000-4000-8000-000000000003", company_id: CO, customer_name: "Cove Café", status: "Active", active: true, on_hold: true },
  lighthouse: { id: "de3c0000-0000-4000-8000-000000000004", company_id: CO, customer_name: "Lighthouse Hotel", email: "stores@lighthousehotel.example", status: "Active", active: true },
  oldMill: { id: "de3c0000-0000-4000-8000-000000000005", company_id: CO, customer_name: "Old Mill Bistro", status: "Inactive", active: false },
} as const;

export const DEMO_PRODUCTS = {
  beefPie: { id: "de3f0000-0000-4000-8000-000000000001", company_id: CO, product_name: "Beef & Ale Pie 200g", sku: "HK-PIE-BEEF", selling_price: 38, total_cost: 17.5 },
  chickenPie: { id: "de3f0000-0000-4000-8000-000000000002", company_id: CO, product_name: "Chicken & Leek Pie 200g", sku: "HK-PIE-CHK", selling_price: 36, total_cost: 16.2 },
  quiche: { id: "de3f0000-0000-4000-8000-000000000003", company_id: CO, product_name: "Spinach Quiche 180g", sku: "HK-QUICHE", selling_price: 32, total_cost: 14 },
  soup: { id: "de3f0000-0000-4000-8000-000000000004", company_id: CO, product_name: "Tomato Soup 500ml", sku: "HK-SOUP-TOM", selling_price: 28, total_cost: 9.8 },
  sauce: { id: "de3f0000-0000-4000-8000-000000000005", company_id: CO, product_name: "Smoky BBQ Sauce 250ml", sku: "HK-SAUCE-BBQ", selling_price: 24, total_cost: null },
  hamper: { id: "de3f0000-0000-4000-8000-000000000006", company_id: CO, product_name: "Harbour Gift Hamper", sku: "HK-GIFT", selling_price: 450, total_cost: 390 },
  // Two products carry the same SKU — a real-world data problem the engine must not guess through.
  tartSmall: { id: "de3f0000-0000-4000-8000-000000000007", company_id: CO, product_name: "Lemon Tart 6in", sku: "HK-TART", selling_price: 60, total_cost: 24 },
  tartLarge: { id: "de3f0000-0000-4000-8000-000000000008", company_id: CO, product_name: "Lemon Tart 9in", sku: "HK-TART", selling_price: 95, total_cost: 38 },
} as const;

const P = DEMO_PRODUCTS;
const C = DEMO_CUSTOMERS;

/** An existing, live sales order holding 40 chicken pies — so only 20 of 60 are free. */
export const DEMO_EXISTING_ORDER_ID = "de350000-0000-4000-8000-000000000001";

/** The whole fictional tenant as table rows (for the in-memory database or a staging seed). */
export function demoSeed(): Record<string, Array<Record<string, unknown>>> {
  return {
    vyron_workspaces: [{ id: DEMO_WORKSPACE_ID, company_id: CO, company_name: "Harbour Kitchen Foods (demo)", default_vat_rate: 15 }],
    vyron_customers: Object.values(C).map((c) => ({ ...c })),
    vyron_cost_products: Object.values(P).map((p) => ({ ...p })),
    vyron_cost_stock_items: [
      { id: "de351000-0000-4000-8000-000000000001", company_id: CO, entity_type: "finished_goods", entity_id: P.beefPie.id, qty_on_hand: 240 },
      { id: "de351000-0000-4000-8000-000000000002", company_id: CO, entity_type: "finished_goods", entity_id: P.chickenPie.id, qty_on_hand: 60 },
      { id: "de351000-0000-4000-8000-000000000003", company_id: CO, entity_type: "finished_goods", entity_id: P.quiche.id, qty_on_hand: 0 },
      { id: "de351000-0000-4000-8000-000000000004", company_id: CO, entity_type: "finished_goods", entity_id: P.soup.id, qty_on_hand: 120 },
      { id: "de351000-0000-4000-8000-000000000005", company_id: CO, entity_type: "finished_goods", entity_id: P.sauce.id, qty_on_hand: 80 },
      { id: "de351000-0000-4000-8000-000000000006", company_id: CO, entity_type: "finished_goods", entity_id: P.hamper.id, qty_on_hand: 3 },
    ],
    vyron_cost_boms: [
      { id: "de3b0000-0000-4000-8000-000000000001", company_id: CO, product_id: P.beefPie.id },
      { id: "de3b0000-0000-4000-8000-000000000002", company_id: CO, product_id: P.chickenPie.id },
      { id: "de3b0000-0000-4000-8000-000000000003", company_id: CO, product_id: P.quiche.id },
    ],
    vyron_customer_price_list_assignments: [
      { id: "de3a0000-0000-4000-8000-000000000001", company_id: CO, customer_id: C.northside.id, default_price_list_id: null, contract_price_list_id: "de310000-0000-4000-8000-000000000001", status: "Active" },
    ],
    vyron_customer_price_list_items: [
      { id: "de3e0000-0000-4000-8000-000000000001", company_id: CO, price_list_id: "de310000-0000-4000-8000-000000000001", product_id: P.beefPie.id, final_price: 35, status: "Active", effective_from: "2026-01-01" },
    ],
    vyron_customer_price_lists: [],
    vyron_customer_price_list_versions: [],
    vyron_customer_branches: [],
    vyron_cost_product_pack_sizes: [
      { id: "de3d0000-0000-4000-8000-000000000001", company_id: CO, product_id: P.soup.id, units_per_box: 12, confidence: "Confirmed", evidence_source: "demo" },
    ],
    vyron_customer_order_policies: [
      {
        id: "de370000-0000-4000-8000-000000000001",
        company_id: CO,
        customer_id: C.lighthouse.id,
        require_po: true,
        require_delivery_date: true,
        min_order_value: 500,
        min_gp_pct: 40,
        enforce_case_quantity: true,
        delivery_weekdays: [1, 3, 5],
        order_cutoff_time: null,
        special_instructions: "Deliver to the goods entrance on Quay Road before 09:00.",
        updated_by: "demo",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    vyron_customer_sales_orders: [{ id: DEMO_EXISTING_ORDER_ID, company_id: CO, order_number: "SO-DEMO-0001", customer_id: C.bayStreet.id, customer_name: C.bayStreet.customer_name, status: "Picking" }],
    vyron_customer_sales_order_lines: [],
    vyron_customer_sales_order_allocations: [
      { id: "de360000-0000-4000-8000-000000000001", company_id: CO, sales_order_id: DEMO_EXISTING_ORDER_ID, product_id: P.chickenPie.id, reserved_qty: 40, status: "Reserved" },
    ],
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
    // The fictional tenant has decided that web-store orders are fulfilled in
    // VOLORA; everything else is left undecided on purpose.
    vyron_order_engine_settings: [
      { company_id: CO, b2c_customer_id: null, product_name_matching: "review", duplicate_po_action: "warn", min_lead_time_days: null, web_orders_mode: "fulfil", updated_by: "demo", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
    ],
    // Both fictional stores have been through activation (configured, UAT
    // passed, activated by a named person). Nothing is active merely because
    // a channel row exists.
    vyron_order_channel_settings: [
      {
        id: "0b0d0000-0000-4000-8000-000000000001",
        company_id: CO,
        channel_key: "woocommerce:demo-web",
        channel_type: "web_store",
        label: "Demo web store",
        enabled: true,
        prices_include_tax: null,
        eligible_statuses: null,
        activation_state: "ACTIVE",
        activated_at: "2026-09-01T00:00:00Z",
        activated_by: "demo",
        uat_passed_at: "2026-08-31T00:00:00Z",
        uat_reference: "DEMO-UAT",
        updated_by: "demo",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "0b0d0000-0000-4000-8000-000000000002",
        company_id: CO,
        channel_key: "shopify:demo-shop",
        channel_type: "web_store",
        label: "Demo Shopify store",
        enabled: true,
        prices_include_tax: null,
        eligible_statuses: null,
        activation_state: "ACTIVE",
        activated_at: "2026-09-01T00:00:00Z",
        activated_by: "demo",
        uat_passed_at: "2026-08-31T00:00:00Z",
        uat_reference: "DEMO-UAT",
        updated_by: "demo",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    vyron_order_mailboxes: [],
    vyron_order_document_extractions: [],
  };
}

export type ScenarioInput =
  | { kind: "candidate"; candidate: OrderCandidate }
  | { kind: "csv"; text: string; fileName: string }
  | { kind: "woocommerce"; storeKey: string; order: WooOrder }
  | { kind: "shopify"; storeKey: string; order: ShopifyOrder };

export type DemoScenario = {
  id: string;
  title: string;
  /** One sentence for the demo script. */
  story: string;
  input: ScenarioInput;
  /** Scenarios that must be received first (e.g. for a duplicate PO). */
  after?: string[];
  expect: {
    status: "AWAITING_APPROVAL" | "EXCEPTION";
    codes: string[];
    /** Codes that must NOT be raised. */
    absent?: string[];
  };
};

const manual = (fields: Partial<OrderCandidate> & { lines: OrderCandidate["lines"] }): ScenarioInput => ({
  kind: "candidate",
  candidate: { source: "manual", requestedDeliveryDate: "2026-10-02", ...fields },
});

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "simple-valid",
    title: "Simple valid B2B order",
    story: "Bay Street Deli orders 24 beef pies at the standard price.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1001", lines: [{ sku: "HK-PIE-BEEF", description: "Beef pies", quantity: 24, unitPrice: 38 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRICE_MISMATCH", "INSUFFICIENT_STOCK", "PRODUCT_UNMATCHED"] },
  },
  {
    id: "multi-product",
    title: "Several products, contract price",
    story: "Northside Grocers orders four products; their contract price for beef pies applies.",
    input: manual({
      customerName: "Northside Grocers",
      customerPoNumber: "NG-7781",
      lines: [
        { sku: "HK-PIE-BEEF", quantity: 48 },
        { sku: "HK-SOUP-TOM", quantity: 24, unitPrice: 28 },
        { sku: "HK-PIE-CHK", quantity: 10, unitPrice: 36 },
        { sku: "HK-SAUCE-BBQ", quantity: 12, unitPrice: 24 },
      ],
    }),
    expect: { status: "AWAITING_APPROVAL", codes: ["PRICE_FROM_VYRON", "MARGIN_NOT_MEASURED"], absent: ["PRICE_MISMATCH"] },
  },
  {
    id: "unmatched-sku",
    title: "Unknown SKU",
    story: "Bay Street Deli asks for a lamb pie VOLORA does not make — nothing is guessed.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1002", lines: [{ sku: "HK-PIE-LAMB", description: "Lamb & Rosemary Pie", quantity: 12, unitPrice: 40 }] }),
    expect: { status: "EXCEPTION", codes: ["PRODUCT_UNMATCHED"] },
  },
  {
    id: "wrong-price",
    title: "Price differs from the price list",
    story: "Bay Street Deli's order states R30 for beef pies; VOLORA's price is R38.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1003", lines: [{ sku: "HK-PIE-BEEF", quantity: 12, unitPrice: 30 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["PRICE_MISMATCH"] },
  },
  {
    id: "insufficient-stock",
    title: "Not enough stock",
    story: "50 chicken pies ordered; 60 on hand but 40 already reserved for another order.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1004", lines: [{ sku: "HK-PIE-CHK", quantity: 50, unitPrice: 36 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "PRODUCTION_REQUIRED"] },
  },
  {
    id: "production-required",
    title: "Production required",
    story: "40 quiches ordered with none in stock — a BOM exists, so production is flagged.",
    input: manual({ customerName: "Northside Grocers", customerPoNumber: "NG-7782", lines: [{ sku: "HK-QUICHE", quantity: 40, unitPrice: 32 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["INSUFFICIENT_STOCK", "PRODUCTION_REQUIRED"], absent: ["NO_BOM_FOR_SHORTFALL"] },
  },
  {
    id: "low-margin",
    title: "Margin below the customer's minimum",
    story: "Lighthouse Hotel orders gift hampers; their policy asks for 40% margin and hampers make about 13%.",
    input: manual({
      customerName: "Lighthouse Hotel",
      customerPoNumber: "LH-3300",
      requestedDeliveryDate: "2026-10-05",
      lines: [{ sku: "HK-GIFT", quantity: 2, unitPrice: 450 }],
    }),
    expect: { status: "AWAITING_APPROVAL", codes: ["LOW_MARGIN", "SPECIAL_INSTRUCTIONS"], absent: ["MISSING_PO"] },
  },
  {
    id: "duplicate-po",
    title: "Duplicate PO",
    story: "Bay Street Deli sends PO BSD-1001 a second time.",
    after: ["simple-valid"],
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1001", lines: [{ sku: "HK-PIE-BEEF", quantity: 24, unitPrice: 38 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["POSSIBLE_DUPLICATE_PO"] },
  },
  {
    id: "past-delivery",
    title: "Delivery date in the past",
    story: "An order asks for delivery on a date that has already passed.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1005", requestedDeliveryDate: "2026-09-20", lines: [{ sku: "HK-SOUP-TOM", quantity: 12, unitPrice: 28 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["DELIVERY_DATE_PAST"] },
  },
  {
    id: "warning-only",
    title: "Warnings only — customer on hold",
    story: "Cove Café is on hold; the order itself is fine, so it can be approved with acknowledgement.",
    input: manual({ customerName: "Cove Café", customerPoNumber: "CC-55", lines: [{ sku: "HK-SOUP-TOM", quantity: 24, unitPrice: 28 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["CUSTOMER_ON_HOLD"] },
  },
  {
    id: "multiple-exceptions",
    title: "Several blocking problems at once",
    story: "An order from an unknown buyer with an ambiguous SKU, a zero price and a zero quantity.",
    input: manual({
      customerName: "Harbourview Catering",
      lines: [
        { sku: "HK-TART", quantity: 4, unitPrice: 60 },
        { sku: "HK-PIE-BEEF", quantity: 6, unitPrice: 0 },
        { sku: "HK-SOUP-TOM", quantity: 0, unitPrice: 28 },
      ],
    }),
    expect: { status: "EXCEPTION", codes: ["CUSTOMER_NOT_FOUND", "PRODUCT_AMBIGUOUS", "PRICE_ZERO", "INVALID_QUANTITY"] },
  },
  {
    id: "csv-order",
    title: "CSV order",
    story: "Northside Grocers' buying system exports a CSV order.",
    input: {
      kind: "csv",
      fileName: "northside-po-7790.csv",
      text:
        "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price\n" +
        "Northside Grocers,NG-7790,2026-10-02,HK-PIE-BEEF,Beef & Ale Pie,36,35.00\n" +
        "Northside Grocers,NG-7790,2026-10-02,HK-SOUP-TOM,Tomato Soup,24,28.00\n",
    },
    expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["PRICE_MISMATCH"] },
  },
  {
    id: "woocommerce-order",
    title: "Web-store order (WooCommerce format)",
    story: "A WooCommerce-shaped order with a coupon and shipping — converted, not connected.",
    input: {
      kind: "woocommerce",
      storeKey: "demo-web",
      order: {
        id: 90211,
        number: "90211",
        status: "processing",
        currency: "ZAR",
        date_created: "2026-09-28T10:15:00",
        prices_include_tax: false,
        customer_id: 0,
        billing: { company: "Bay Street Deli", email: "buying@baystreetdeli.example" },
        shipping_total: "65.00",
        discount_total: "7.60",
        total: "474.26",
        total_tax: "51.86",
        coupon_lines: [{ code: "SPRING10", discount: "7.60" }],
        line_items: [
          { id: 1, sku: "HK-PIE-BEEF", name: "Beef & Ale Pie 200g", quantity: 2, price: 34.2, subtotal: "76.00", total: "68.40", total_tax: "10.26" },
          { id: 2, sku: "HK-SOUP-TOM", name: "Tomato Soup 500ml", quantity: 10, price: 28, subtotal: "280.00", total: "280.00", total_tax: "42.00" },
        ],
      },
    },
    expect: { status: "AWAITING_APPROVAL", codes: ["SHIPPING_NOT_CARRIED", "COUPON_APPLIED"], absent: ["LINE_TOTAL_MISMATCH", "PRICES_INCLUDE_TAX"] },
  },
  {
    id: "shopify-order",
    title: "Web-store order (Shopify format), tax-inclusive prices",
    story: "A Shopify-shaped order whose prices include VAT — blocked until a person enters ex-tax prices.",
    input: {
      kind: "shopify",
      storeKey: "demo-shop",
      order: {
        id: 5550001,
        name: "#1042",
        created_at: "2026-09-28T08:00:00Z",
        currency: "ZAR",
        financial_status: "paid",
        taxes_included: true,
        customer: { id: 881, email: "stores@lighthousehotel.example" },
        subtotal_price: "437.00",
        total_price: "437.00",
        total_tax: "57.00",
        line_items: [{ id: 11, sku: "HK-PIE-BEEF", name: "Beef & Ale Pie 200g", quantity: 10, price: "43.70", discount_allocations: [] }],
      },
    },
    expect: { status: "EXCEPTION", codes: ["PRICES_INCLUDE_TAX", "CUSTOMER_NOT_FOUND"] },
  },
  {
    id: "with-discount",
    title: "Order with a line discount",
    story: "Northside Grocers gets R60 off a soup line; the discount travels to the sales order.",
    input: manual({ customerName: "Northside Grocers", customerPoNumber: "NG-7791", lines: [{ sku: "HK-SOUP-TOM", quantity: 24, unitPrice: 28, discountAmount: 60, lineTotal: 612 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["LINE_TOTAL_MISMATCH"] },
  },
  {
    id: "with-tax",
    title: "Order stating its tax",
    story: "An order states its VAT; VOLORA records it and the sales order applies the workspace VAT rate.",
    input: manual({
      customerName: "Bay Street Deli",
      customerPoNumber: "BSD-1006",
      supplied: { subtotal: 336, taxTotal: 50.4, total: 386.4 },
      lines: [{ sku: "HK-SOUP-TOM", quantity: 12, unitPrice: 28, taxAmount: 50.4, lineTotal: 336 }],
    }),
    expect: { status: "AWAITING_APPROVAL", codes: [], absent: ["SUBTOTAL_MISMATCH", "LINE_TOTAL_MISMATCH"] },
  },
  {
    id: "no-cost",
    title: "Product with no cost in VOLORA",
    story: "BBQ sauce has no cost recorded, so margin is shown as Not Measured — never as zero.",
    input: manual({ customerName: "Bay Street Deli", customerPoNumber: "BSD-1007", lines: [{ sku: "HK-SAUCE-BBQ", quantity: 12, unitPrice: 24 }] }),
    expect: { status: "AWAITING_APPROVAL", codes: ["MARGIN_NOT_MEASURED"], absent: ["NEGATIVE_MARGIN"] },
  },
  {
    id: "customer-policy",
    title: "Customer ordering rules",
    story: "Lighthouse Hotel requires a PO, delivery Mon/Wed/Fri, whole cases and R500 minimum — this order breaks all four.",
    input: manual({ customerName: "Lighthouse Hotel", requestedDeliveryDate: "2026-10-06", lines: [{ sku: "HK-SOUP-TOM", quantity: 10, unitPrice: 28 }] }),
    expect: { status: "EXCEPTION", codes: ["MISSING_PO", "DELIVERY_DAY_NOT_ALLOWED", "CASE_QUANTITY", "BELOW_MINIMUM_ORDER"] },
  },
  {
    id: "inactive-customer",
    title: "Inactive customer",
    story: "Old Mill Bistro is no longer an active customer.",
    input: manual({ customerName: "Old Mill Bistro", customerPoNumber: "OMB-9", lines: [{ sku: "HK-SOUP-TOM", quantity: 12, unitPrice: 28 }] }),
    expect: { status: "EXCEPTION", codes: ["CUSTOMER_INACTIVE"] },
  },
  {
    id: "ambiguous-product",
    title: "Two products share a SKU",
    story: "Two tarts carry the same SKU in VOLORA's master data — the engine lists both and asks.",
    input: manual({ customerName: "Northside Grocers", customerPoNumber: "NG-7792", lines: [{ sku: "HK-TART", quantity: 6, unitPrice: 60 }] }),
    expect: { status: "EXCEPTION", codes: ["PRODUCT_AMBIGUOUS"] },
  },
];
