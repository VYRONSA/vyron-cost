#!/usr/bin/env node
/**
 * VYRON Order Engine — domain regression.
 *
 * Drives the real src/lib/order-engine code (and the real sales-order engine it
 * hands off to) against an in-memory database seeded with two synthetic tenants.
 * No network, no real database, no real tenant data.
 *
 * Proves: lifecycle; deterministic matching (exact / normalised / alias /
 * name-only-without-SKU, never fuzzy); ambiguity and non-matches become
 * blocking exceptions; validation (customer, price, stock net of reservations,
 * production, margin Not Measured, commercial, arithmetic); idempotent receive;
 * approval re-validation, warning acknowledgement, compare-and-set; idempotent
 * handoff to a Draft sales order with nothing posted; audit with server actors;
 * tenant isolation; CSV / e-mail / WooCommerce / Shopify adapters.
 *
 *   node scripts/test-order-engine.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-order-engine";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};
const section = (title) => console.log(`\n${title}`);
async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const lifecycle = await importFromRoot("src/lib/order-engine/lifecycle.ts");
const normalize = await importFromRoot("src/lib/order-engine/normalize.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const { receiveInboundEmail } = await importFromRoot("src/lib/order-engine/email-intake.ts");
const { parseCsvOrder } = await importFromRoot("src/lib/order-engine/adapters/csv.ts");
const { manualOrderAdapter } = await importFromRoot("src/lib/order-engine/adapters/manual.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const { OrderEngineError } = await importFromRoot("src/lib/order-engine/errors.ts");

const CO = "11111111-1111-4111-8111-111111111111";
const CO_B = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-09-22";
const CLERK = { userId: "user-clerk", name: "Clerk One" };
const APPROVER = { userId: "user-approver", name: "Approver One" };

const seed = () => ({
  vyron_workspaces: [
    { id: "ws-a", company_id: CO, company_name: "Synthetic Foods A", default_vat_rate: 15 },
    { id: "ws-b", company_id: CO_B, company_name: "Synthetic Foods B", default_vat_rate: 15 },
  ],
  vyron_customers: [
    { id: "c-acme", company_id: CO, customer_name: "Acme Deli", email: "orders@acme.test", status: "Active", active: true },
    { id: "c-hold", company_id: CO, customer_name: "Held Grocer", status: "Active", active: true, on_hold: true },
    { id: "c-off", company_id: CO, customer_name: "Closed Café", status: "Inactive", active: false },
    { id: "c-twin1", company_id: CO, customer_name: "Twin Stores", status: "Active" },
    { id: "c-twin2", company_id: CO, customer_name: "twin  stores", status: "Active" },
    { id: "c-b", company_id: CO_B, customer_name: "Acme Deli", status: "Active" },
  ],
  vyron_cost_products: [
    { id: "p-pie", company_id: CO, product_name: "Steak Pie 150g", sku: "PIE-150", selling_price: 20, total_cost: 12 },
    { id: "p-under", company_id: CO, product_name: "Under Score", sku: "FS_1", selling_price: 10, total_cost: 4 },
    { id: "p-lower", company_id: CO, product_name: "Lower Case", sku: "abc-9", selling_price: 30, total_cost: 10 },
    { id: "p-dup1", company_id: CO, product_name: "Dup One", sku: "DUP-1", selling_price: 5, total_cost: 2 },
    { id: "p-dup2", company_id: CO, product_name: "Dup Two", sku: "DUP-1", selling_price: 5, total_cost: 2 },
    { id: "p-named", company_id: CO, product_name: "House Salad", sku: null, selling_price: 40, total_cost: 15 },
    { id: "p-nocost", company_id: CO, product_name: "Mystery Box", sku: "MYS-1", selling_price: 50, total_cost: null },
    { id: "p-noprice", company_id: CO, product_name: "Unpriced", sku: "NOP-1", selling_price: 0, total_cost: 3 },
    { id: "p-alias", company_id: CO, product_name: "Aliased Product", sku: "INTERNAL-7", selling_price: 9, total_cost: 5 },
    { id: "p-b", company_id: CO_B, product_name: "Foreign Pie", sku: "PIE-150", selling_price: 99, total_cost: 1 },
    { id: "p-bonly", company_id: CO_B, product_name: "B Only", sku: "B-ONLY", selling_price: 1, total_cost: 1 },
  ],
  vyron_customer_item_mappings: [{ id: "m1", company_id: CO, source_item_code: "CUST-CODE-7", product_id: "p-alias" }],
  vyron_cost_stock_items: [
    { id: "s1", company_id: CO, entity_type: "finished_goods", entity_id: "p-pie", qty_on_hand: 100 },
    { id: "s2", company_id: CO, entity_type: "finished_goods", entity_id: "p-under", qty_on_hand: 5 },
    { id: "s3", company_id: CO, entity_type: "finished_goods", entity_id: "p-lower", qty_on_hand: 1000 },
  ],
  vyron_customer_sales_order_allocations: [
    { id: "al1", company_id: CO, sales_order_id: "so-old", product_id: "p-pie", reserved_qty: 80, status: "Reserved" },
    { id: "al2", company_id: CO, sales_order_id: "so-old2", product_id: "p-pie", reserved_qty: 500, status: "Converted" },
  ],
  vyron_cost_boms: [{ id: "bom-pie", company_id: CO, product_id: "p-pie" }],
  vyron_customer_price_list_assignments: [],
  vyron_customer_price_list_items: [],
  vyron_customer_price_lists: [],
  vyron_customer_price_list_versions: [],
  vyron_customer_branches: [],
  vyron_customer_invoices: [],
  vyron_customer_invoice_lines: [],
  vyron_customer_sales_orders: [],
  vyron_customer_sales_order_lines: [],
  vyron_customer_sales_order_audit: [],
  vyron_cost_stock_ledger: [],
  vyron_stock_movements: [],
  vyron_xero_sync_queue: [],
  vyron_order_intakes: [],
  vyron_order_intake_lines: [],
  vyron_order_intake_events: [],
  vyron_order_source_messages: [],
});

const manual = (overrides = {}) => ({
  source: "manual",
  customerName: "Acme Deli",
  customerPoNumber: "PO-1",
  requestedDeliveryDate: "2026-10-01",
  lines: [{ sku: "PIE-150", description: "Steak pie", quantity: 10, unitPrice: 20 }],
  ...overrides,
});

const receive = (db, candidate, company = CO) => service.receiveOrderCandidate(db, company, candidate, CLERK);
const act = (db, id, action, options = {}, actor = APPROVER, company = CO) =>
  service.performIntakeAction(db, company, id, action, actor, { today: TODAY, ...options });
const validate = (db, id) => act(db, id, "validate", {}, CLERK);
const codes = (detail) => (detail.intake.validation.issues || []).map((i) => i.code);

// ---------------------------------------------------------------------------
section("Lifecycle (pure)");
{
  check("approve only from AWAITING_APPROVAL", lifecycle.canStartAction("AWAITING_APPROVAL", "approve") && !lifecycle.canStartAction("EXCEPTION", "approve") && !lifecycle.canStartAction("RECEIVED", "approve"));
  check("terminal states allow nothing", ["CONFIRMED", "REJECTED", "CANCELLED"].every((s) => lifecycle.INTAKE_ACTIONS.every((a) => !lifecycle.canStartAction(s, a))));
  check("every ACTION_FROM start is a real edge source", Object.values(lifecycle.ACTION_FROM).flat().every((s) => s in lifecycle.TRANSITIONS));
  const viewer = lifecycle.availableIntakeActions("AWAITING_APPROVAL", (p) => p === "sales_orders.view");
  const approver = lifecycle.availableIntakeActions("AWAITING_APPROVAL", (p) => p === "sales_orders.approve");
  check("a viewer sees no actions", viewer.length === 0);
  check("an approver sees approve/hold/request_changes/reject", ["approve", "hold", "request_changes", "reject"].every((a) => approver.includes(a)) && !approver.includes("cancel"));
  check("fulfilment derives from sales order", lifecycle.deriveFulfilmentStatus("Picking") === "IN_PROGRESS" && lifecycle.deriveFulfilmentStatus(null) === "NOT_APPLICABLE");
  check("invoice derives from sales order", lifecycle.deriveInvoiceStatus("Partially Invoiced") === "PARTIALLY_INVOICED" && lifecycle.deriveInvoiceStatus("Draft") === "NOT_INVOICED");
  check("approval status derives from intake", lifecycle.deriveApprovalStatus("CONFIRMED") === "APPROVED" && lifecycle.deriveApprovalStatus("EXCEPTION") === "PENDING");
}

section("Normalisation");
{
  check("SKU: trim + upper only", normalize.normalizeSku("  ab-1 ") === "AB-1" && normalize.normalizeSku("AB 1") !== normalize.normalizeSku("AB1"));
  check("SKU keeps hyphens (AB-1 ≠ AB1)", normalize.normalizeSku("AB-1") !== normalize.normalizeSku("AB1"));
  check("name collapses whitespace", normalize.normalizeName(" Twin   Stores ") === "twin stores");
  check("ISO date accepted", normalize.toIsoDateOrNull("2026-10-01") === "2026-10-01");
  check("impossible date refused", normalize.toIsoDateOrNull("2026-02-30") === null);
  check("locale date refused (no guessing)", normalize.toIsoDateOrNull("01/10/2026") === null);
  check("number with thousands and currency", normalize.toNumberOrNull("R 1,234.50") === 1234.5);
  check("garbage number refused", normalize.toNumberOrNull("12abc") === null);
  check("stable hash ignores key order", normalize.stableHash({ a: 1, b: 2 }) === normalize.stableHash({ b: 2, a: 1 }));
  check("escapeLike escapes % _ \\", normalize.escapeLike("a_b%c\\") === "a\\_b\\%c\\\\");
}

// ---------------------------------------------------------------------------
section("Receive, idempotency and malformed input");
{
  const db = createFakeSupabase(seed());
  const first = await receive(db, manual({ idempotencyKey: undefined, sourceKey: "draft-1" }));
  check("manual order received as RECEIVED", first.intake.status === "RECEIVED" && first.lines.length === 1 && !first.duplicate);
  check("created_by is the server actor", first.intake.created_by === CLERK.userId);
  check("intake number format", /^ORD-\d{6}-[0-9A-F]{6}$/.test(first.intake.intake_number));
  const again = await receive(db, manual({ sourceKey: "draft-1" }));
  check("same key + same content → existing intake, no duplicate", again.duplicate && again.intake.id === first.intake.id && db.tables.vyron_order_intakes.length === 1);
  check("duplicate receipt is audited", db.tables.vyron_order_intake_events.some((e) => e.event_type === "RECEIVE_DUPLICATE"));
  const changed = await rejects(receive(db, manual({ sourceKey: "draft-1", lines: [{ sku: "PIE-150", quantity: 11, unitPrice: 20 }] })));
  check("same key + different content → refused, not overwritten", changed?.code === "DUPLICATE_SOURCE_CONFLICT" && db.tables.vyron_order_intake_lines.find((l) => l.intake_id === first.intake.id).quantity === 10);
  await receive(db, manual({ sourceKey: null }));
  await receive(db, manual({ sourceKey: null }));
  check("manual without a key creates separate orders", db.tables.vyron_order_intakes.length === 3);
  const sameKeyOtherTenant = await receive(db, manual({ sourceKey: "draft-1", customerName: "Acme Deli" }), CO_B);
  check("the same key in another tenant is a different order", !sameKeyOtherTenant.duplicate && sameKeyOtherTenant.intake.company_id === CO_B);

  const bad = [
    ["no lines", manual({ lines: [] })],
    ["NaN quantity", manual({ lines: [{ sku: "PIE-150", quantity: Number.NaN }] })],
    ["line with nothing", manual({ lines: [{ quantity: 1 }] })],
    ["duplicate line reference", manual({ lines: [{ sku: "A", quantity: 1, sourceLineReference: "L1" }, { sku: "B", quantity: 1, sourceLineReference: "L1" }] })],
    ["bad delivery date", manual({ requestedDeliveryDate: "tomorrow" })],
    ["unknown source", manual({ source: "fax" })],
    ["csv without source key", manual({ source: "csv" })],
    ["non-numeric price", manual({ lines: [{ sku: "PIE-150", quantity: 1, unitPrice: "abc" }] })],
    ["foreign customer id", manual({ customerId: "c-b" })],
  ];
  for (const [label, candidate] of bad) {
    const error = await rejects(receive(db, candidate));
    check(`malformed: ${label} → INVALID_INPUT`, error?.code === "INVALID_INPUT", error?.message);
  }
  const tooMany = await rejects(receive(db, manual({ lines: Array.from({ length: 501 }, () => ({ sku: "PIE-150", quantity: 1 })) })));
  check("more than 500 lines refused", tooMany?.code === "INVALID_INPUT");

  // A concurrent insert that loses the unique race re-reads the winner.
  const raceDb = createFakeSupabase(seed());
  const winner = await receive(raceDb, manual({ sourceKey: "race" }));
  const originalFrom = raceDb.from.bind(raceDb);
  let lookups = 0;
  raceDb.from = (table) => {
    const query = originalFrom(table);
    if (table !== "vyron_order_intakes") return query;
    const maybeSingle = query.maybeSingle.bind(query);
    query.maybeSingle = () => (++lookups === 1 ? Promise.resolve({ data: null, error: null }) : maybeSingle());
    const insert = query.insert.bind(query);
    query.insert = (payload) => {
      insert(payload);
      query.single = () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
      return query;
    };
    return query;
  };
  const raced = await receive(raceDb, manual({ sourceKey: "race" }));
  check("lost insert race resolves to the winner", raced.duplicate && raced.intake.id === winner.intake.id);
}

// ---------------------------------------------------------------------------
section("Deterministic product matching");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(
    db,
    manual({
      lines: [
        { sku: "PIE-150", quantity: 1, unitPrice: 20 }, // 1 exact
        { sku: "  ABC-9 ", quantity: 1, unitPrice: 30 }, // 2 normalised
        { sku: "FS_1", quantity: 1, unitPrice: 10 }, // 3 underscore is literal
        { sku: "FSX1", quantity: 1, unitPrice: 10 }, // 4 must NOT match FS_1
        { sku: "DUP-1", quantity: 1, unitPrice: 5 }, // 5 ambiguous
        { sku: "CUST-CODE-7", quantity: 1, unitPrice: 9 }, // 6 alias
        { description: "house   SALAD", quantity: 1, unitPrice: 40 }, // 7 name only (no SKU)
        { sku: "NOT-A-SKU", description: "Steak Pie 150g", quantity: 1, unitPrice: 20 }, // 8 SKU given, not found → no name fallback
        { sku: "B-ONLY", quantity: 1, unitPrice: 1 }, // 9 other tenant's SKU
        { sku: "PIE", quantity: 1, unitPrice: 20 }, // 10 prefix is not a match
      ],
    })
  );
  const detail = await validate(db, intake.id);
  const byNo = new Map(detail.lines.map((l) => [l.line_no, l]));
  check("exact SKU → MATCHED sku_exact", byNo.get(1).match_status === "MATCHED" && byNo.get(1).match_rule === "sku_exact" && byNo.get(1).product_id === "p-pie");
  check("normalised SKU → MATCHED sku_normalized", byNo.get(2).match_rule === "sku_normalized" && byNo.get(2).product_id === "p-lower");
  check("underscore SKU matched literally", byNo.get(3).product_id === "p-under");
  check("FSX1 is not matched to FS_1 (no wildcard)", byNo.get(4).match_status === "UNMATCHED");
  check("shared SKU → AMBIGUOUS with both candidates", byNo.get(5).match_status === "AMBIGUOUS" && byNo.get(5).match_candidates.length === 2 && byNo.get(5).product_id === null);
  check("approved alias → MATCHED alias", byNo.get(6).match_rule === "alias" && byNo.get(6).product_id === "p-alias");
  check("name only when no SKU → MATCHED name_exact", byNo.get(7).match_rule === "name_exact" && byNo.get(7).product_id === "p-named");
  check("name match raises a review warning", detail.intake.validation.issues.some((i) => i.code === "PRODUCT_MATCHED_BY_NAME" && i.lineNo === 7));
  check("SKU not found never falls back to a name match", byNo.get(8).match_status === "UNMATCHED" && byNo.get(8).product_id === null);
  check("another tenant's SKU is not matched", byNo.get(9).match_status === "UNMATCHED");
  check("a SKU prefix is not matched", byNo.get(10).match_status === "UNMATCHED");
  check("unmatched/ambiguous lines put the order in EXCEPTION", detail.intake.status === "EXCEPTION");
  check("exception raised event written", detail.events.some((e) => e.event_type === "EXCEPTION_RAISED"));
  check("blocking count stored", detail.intake.blocking_issue_count === codes(detail).filter((c) => ["PRODUCT_UNMATCHED", "PRODUCT_AMBIGUOUS"].includes(c)).length);
  check("PIE-150 matched in company A to A's product, not B's", byNo.get(1).product_id !== "p-b");
}

// ---------------------------------------------------------------------------
section("Customer identification");
{
  const db = createFakeSupabase(seed());
  const cases = [
    ["unknown name", "Nobody Ltd", "CUSTOMER_NOT_FOUND"],
    ["two customers share a normalised name", "Twin Stores", "CUSTOMER_AMBIGUOUS"],
    ["inactive customer", "Closed Café", "CUSTOMER_INACTIVE"],
  ];
  for (const [label, name, code] of cases) {
    const { intake } = await receive(db, manual({ customerName: name }));
    const detail = await validate(db, intake.id);
    check(`${label} → ${code} (blocking)`, codes(detail).includes(code) && detail.intake.status === "EXCEPTION");
  }
  const held = await receive(db, manual({ customerName: "Held Grocer" }));
  const heldDetail = await validate(db, held.intake.id);
  check("on-hold customer → warning, not blocking", codes(heldDetail).includes("CUSTOMER_ON_HOLD") && heldDetail.intake.status === "AWAITING_APPROVAL");
  const byCase = await receive(db, manual({ customerName: "  ACME   deli " }));
  const byCaseDetail = await validate(db, byCase.intake.id);
  check("exact normalised name resolves the customer", byCaseDetail.intake.customer_id === "c-acme" && byCaseDetail.intake.customer_match_rule === "name_exact");
  const partial = await receive(db, manual({ customerName: "Acme" }));
  check("a partial name does not resolve", codes(await validate(db, partial.intake.id)).includes("CUSTOMER_NOT_FOUND"));
  const foreign = await receive(db, manual({ customerName: "Acme Deli" }), CO_B);
  const foreignDetail = await service.performIntakeAction(db, CO_B, foreign.intake.id, "validate", CLERK, { today: TODAY });
  check("company B resolves its own Acme Deli", foreignDetail.intake.customer_id === "c-b");
}

// ---------------------------------------------------------------------------
section("Price, stock, production, margin, commercial, arithmetic");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(
    db,
    manual({
      requestedDeliveryDate: "2026-09-01",
      customerPoNumber: "PO-DUP",
      lines: [
        { sku: "PIE-150", quantity: 30, unitPrice: 18 }, // price mismatch (20), stock 100-80=20 → short 10, BOM
        { sku: "FS_1", quantity: 8 }, // no price → from master; stock 5 → short 3, no BOM
        { sku: "MYS-1", quantity: 1, unitPrice: 50 }, // no cost → margin not measured
        { sku: "ABC-9", quantity: 2, unitPrice: 5, lineTotal: 99 }, // selling below cost 10; line total wrong
        { sku: "PIE-150", quantity: 1, unitPrice: 20 }, // duplicate product line
      ],
    })
  );
  // An earlier live order with the same PO for the same customer.
  const earlier = await receive(db, manual({ customerPoNumber: "PO-DUP", sourceKey: "earlier" }));
  await validate(db, earlier.intake.id);
  const detail = await validate(db, intake.id);
  const issues = detail.intake.validation.issues;
  const find = (code, lineNo) => issues.find((i) => i.code === code && (lineNo === undefined || i.lineNo === lineNo));
  check("price mismatch → warning with both prices", find("PRICE_MISMATCH", 1)?.data?.supplied === 18 && find("PRICE_MISMATCH", 1)?.data?.expected === 20);
  check("no order price → VYRON price used (info)", find("PRICE_FROM_VYRON", 2)?.severity === "info");
  const pieStock = find("INSUFFICIENT_STOCK", 1);
  check("stock is net of other orders' Reserved allocations only", pieStock?.data?.available === 20 && pieStock?.data?.reservedElsewhere === 80, JSON.stringify(pieStock?.data));
  check("stock demand sums duplicate product lines (31 vs 20 → short 11)", pieStock?.data?.ordered === 31 && pieStock?.data?.shortfall === 11);
  check("shortfall with a BOM → production required (info)", find("PRODUCTION_REQUIRED", 1)?.severity === "info");
  check("shortfall without a BOM → warning", find("NO_BOM_FOR_SHORTFALL", 2)?.severity === "warning");
  check("missing cost → margin Not Measured, not zero", find("MARGIN_NOT_MEASURED")?.severity === "info" && detail.intake.validation.lines.find((l) => l.lineNo === 3).lineGp === null);
  check("selling below cost → warning", find("NEGATIVE_MARGIN", 4)?.severity === "warning");
  check("stated line total checked", find("LINE_TOTAL_MISMATCH", 4)?.severity === "warning");
  check("duplicate product line → warning", find("DUPLICATE_PRODUCT_LINE", 5)?.severity === "warning");
  check("past delivery date → warning", find("DELIVERY_DATE_PAST")?.severity === "warning");
  check("same customer + PO already received → warning", find("POSSIBLE_DUPLICATE_PO")?.severity === "warning");
  check("warnings alone do not block", detail.intake.status === "AWAITING_APPROVAL");
  const totals = detail.intake.validation.totals;
  // costed lines: pie 30×18=540 cost 360; FS_1 8×10=80 cost 32; ABC 2×5=10 cost 20; pie 20 cost 12 → net 650, cost 424
  check("expected GP covers costed lines only", totals.expectedCost === 424 && totals.expectedGp === 226 && totals.marginNotMeasuredLines === 1, JSON.stringify(totals));

  const db2 = createFakeSupabase(seed());
  const zero = await receive(db2, manual({ lines: [{ sku: "PIE-150", quantity: 1, unitPrice: 0 }, { sku: "NOP-1", quantity: 1 }, { sku: "PIE-150", quantity: 0, unitPrice: 20 }] }));
  const zeroDetail = await validate(db2, zero.intake.id);
  check("zero price → blocking (handoff would substitute a price)", codes(zeroDetail).includes("PRICE_ZERO"));
  check("no price anywhere → PRICE_MISSING (blocking)", codes(zeroDetail).includes("PRICE_MISSING"));
  check("zero quantity → INVALID_QUANTITY (blocking)", codes(zeroDetail).includes("INVALID_QUANTITY"));
  check("these put the order in EXCEPTION", zeroDetail.intake.status === "EXCEPTION");
}

// ---------------------------------------------------------------------------
section("Approval workflow and handoff");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual({ lines: [{ sku: "PIE-150", quantity: 5, unitPrice: 19 }, { sku: "ABC-9", quantity: 2, unitPrice: 30 }] }));
  const validated = await validate(db, intake.id);
  check("clean-but-warned order awaits approval", validated.intake.status === "AWAITING_APPROVAL" && validated.intake.validation_hash);
  check("approval requested event", validated.events.some((e) => e.event_type === "APPROVAL_REQUESTED"));

  const noHash = await rejects(act(db, intake.id, "approve", { acknowledgeWarnings: true }));
  check("approve without the reviewed validation → VALIDATION_REQUIRED", noHash?.code === "VALIDATION_REQUIRED");
  const wrongHash = await rejects(act(db, intake.id, "approve", { acknowledgeWarnings: true, validationHash: "stale" }));
  check("approve against a stale validation → CONFLICT", wrongHash?.code === "CONFLICT");
  const noAck = await rejects(act(db, intake.id, "approve", { validationHash: validated.intake.validation_hash }));
  check("warnings must be acknowledged", noAck?.code === "WARNINGS_NOT_ACKNOWLEDGED" && noAck.details.codes.includes("PRICE_MISMATCH"));
  check("refused approvals changed nothing", db.tables.vyron_order_intakes.find((r) => r.id === intake.id).status === "AWAITING_APPROVAL" && db.tables.vyron_customer_sales_orders.length === 0);

  const confirmed = await act(db, intake.id, "approve", { acknowledgeWarnings: true, validationHash: validated.intake.validation_hash, reason: "Price agreed by phone" });
  check("approved order is CONFIRMED", confirmed.intake.status === "CONFIRMED");
  check("decision recorded with the server actor", confirmed.intake.decision_by === APPROVER.userId && confirmed.intake.decision_note === "Price agreed by phone");
  const so = db.tables.vyron_customer_sales_orders;
  check("exactly one sales order created", so.length === 1);
  check("sales order id is the pre-claimed id", so[0].id === confirmed.intake.pending_sales_order_id && confirmed.intake.sales_order_id === so[0].id);
  check("sales order is a Draft", so[0].status === "Draft");
  check("sales order customer is the resolved customer", so[0].customer_id === "c-acme");
  const soLines = db.tables.vyron_customer_sales_order_lines.filter((l) => l.sales_order_id === so[0].id);
  check("approved prices carried explicitly (19, not master 20)", soLines.find((l) => l.product_id === "p-pie")?.selling_price === 19);
  check("VAT rate from the workspace setting", soLines.every((l) => l.tax_rate === 15));
  check("sales order notes reference the intake", String(so[0].notes).includes(confirmed.intake.intake_number));
  const soAudit = db.tables.vyron_customer_sales_order_audit;
  check("sales-order audit uses the real actor", soAudit.some((a) => a.event_type === "CREATED_FROM_ORDER_INTAKE" && a.actor === APPROVER.userId) && soAudit.some((a) => a.event_type === "SALES_ORDER_CREATED" && a.actor === APPROVER.userId));
  check("nothing posted: no stock ledger, movements, invoices or Xero queue", db.tables.vyron_cost_stock_ledger.length === 0 && db.tables.vyron_stock_movements.length === 0 && db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_xero_sync_queue.length === 0);
  check("nothing reserved", db.tables.vyron_customer_sales_order_allocations.length === 2);
  const approvedEvent = confirmed.events.find((e) => e.event_type === "APPROVED");
  check("approval event lists acknowledged warnings", approvedEvent?.metadata?.acknowledgedWarnings?.some((w) => w.code === "PRICE_MISMATCH"));
  check("audit trail in order", ["RECEIVED", "VALIDATED", "APPROVAL_REQUESTED", "APPROVED", "CONFIRMED"].every((t, i, arr) => {
    const idx = confirmed.events.findIndex((e) => e.event_type === t);
    return idx >= 0 && (i === 0 || idx > confirmed.events.findIndex((e) => e.event_type === arr[i - 1]));
  }));
  check("every event actor is a server actor", confirmed.events.every((e) => [CLERK.userId, APPROVER.userId].includes(e.actor)));
  check("derived statuses after handoff", confirmed.derived.approvalStatus === "APPROVED" && confirmed.derived.fulfilmentStatus === "NOT_STARTED" && confirmed.derived.invoiceStatus === "NOT_INVOICED");
  const twice = await rejects(act(db, intake.id, "approve", { acknowledgeWarnings: true, validationHash: validated.intake.validation_hash }));
  check("a confirmed order cannot be approved again", twice?.code === "INVALID_TRANSITION" && db.tables.vyron_customer_sales_orders.length === 1);
  const edit = await rejects(service.editIntake(db, CO, intake.id, { notes: "late" }, CLERK));
  check("a confirmed order cannot be edited", edit?.code === "INVALID_TRANSITION");
}

section("Approval re-validates against live data");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual({ lines: [{ sku: "PIE-150", quantity: 5, unitPrice: 20 }] }));
  const validated = await validate(db, intake.id);
  check("clean order, no warnings", validated.intake.warning_issue_count === 0 && validated.intake.status === "AWAITING_APPROVAL");
  db.tables.vyron_cost_stock_items.find((s) => s.entity_id === "p-pie").qty_on_hand = 81; // 81-80 = 1 < 5
  const moved = await rejects(act(db, intake.id, "approve", { validationHash: validated.intake.validation_hash }));
  check("stock moved since review → approval refused (CONFLICT)", moved?.code === "CONFLICT");
  const after = await service.getIntakeDetail(db, CO, intake.id);
  check("the refreshed validation is stored for review", after.intake.validation_hash !== validated.intake.validation_hash && codes(after).includes("INSUFFICIENT_STOCK"));
  check("no sales order created", db.tables.vyron_customer_sales_orders.length === 0);
  db.tables.vyron_cost_products = db.tables.vyron_cost_products.filter((p) => p.id !== "p-pie");
  const gone = await rejects(act(db, intake.id, "approve", { validationHash: after.intake.validation_hash, acknowledgeWarnings: true }));
  const afterGone = await service.getIntakeDetail(db, CO, intake.id);
  check("product removed since review → EXCEPTION, approval refused", gone?.code === "VALIDATION_FAILED" && afterGone.intake.status === "EXCEPTION");
  check("re-validation change is audited", afterGone.events.filter((e) => e.event_type === "APPROVAL_REVALIDATION_CHANGED").length === 2);
}

section("Hold, release, request changes, reject, cancel");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual());
  await validate(db, intake.id);
  const noReason = await rejects(act(db, intake.id, "hold"));
  check("hold needs a reason", noReason?.code === "INVALID_INPUT");
  const held = await act(db, intake.id, "hold", { reason: "Waiting for credit check" });
  check("hold → ON_HOLD", held.intake.status === "ON_HOLD" && held.events.some((e) => e.event_type === "HELD" && e.detail === "Waiting for credit check"));
  const approveHeld = await rejects(act(db, intake.id, "approve", { validationHash: held.intake.validation_hash }));
  check("an order on hold cannot be approved", approveHeld?.code === "INVALID_TRANSITION");
  const released = await act(db, intake.id, "release");
  check("release re-validates → AWAITING_APPROVAL", released.intake.status === "AWAITING_APPROVAL" && released.events.some((e) => e.event_type === "RELEASED"));
  const changes = await act(db, intake.id, "request_changes", { reason: "Customer to confirm quantity" });
  check("request changes → RECEIVED with validation cleared", changes.intake.status === "RECEIVED" && !changes.intake.validation_hash);
  const edited = await service.editIntake(db, CO, intake.id, { updateLines: [{ lineId: changes.lines[0].id, quantity: 12 }] }, CLERK);
  check("edit while RECEIVED is audited with the change", edited.lines[0].quantity === 12 && edited.events.some((e) => e.event_type === "EDITED" && e.detail.includes("quantity 10 → 12")));
  await validate(db, intake.id);
  const rejected = await act(db, intake.id, "reject", { reason: "Duplicate of phone order" });
  check("reject → REJECTED", rejected.intake.status === "REJECTED" && rejected.intake.decision_by === APPROVER.userId);
  const afterReject = await rejects(act(db, intake.id, "validate", {}, CLERK));
  check("rejected is terminal", afterReject?.code === "INVALID_TRANSITION");

  const other = await receive(db, manual({ customerName: "Nobody" }));
  await validate(db, other.intake.id);
  const cancelled = await act(db, other.intake.id, "cancel", { reason: "Entered in error" }, CLERK);
  check("an exception can be cancelled with a reason", cancelled.intake.status === "CANCELLED");
}

section("Exception resolution by a person");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual({ customerName: "Twin Stores", lines: [{ sku: "DUP-1", quantity: 1, unitPrice: 5 }] }));
  const exception = await validate(db, intake.id);
  check("starts as EXCEPTION (ambiguous customer and product)", exception.intake.status === "EXCEPTION" && codes(exception).includes("CUSTOMER_AMBIGUOUS") && codes(exception).includes("PRODUCT_AMBIGUOUS"));
  const foreignProduct = await rejects(service.editIntake(db, CO, intake.id, { resolveLines: [{ lineId: exception.lines[0].id, productId: "p-b" }] }, CLERK));
  check("resolving to another tenant's product is refused", foreignProduct?.code === "INVALID_INPUT");
  const foreignCustomer = await rejects(service.editIntake(db, CO, intake.id, { customerId: "c-b" }, CLERK));
  check("resolving to another tenant's customer is refused", foreignCustomer?.code === "INVALID_INPUT");
  const stale = await rejects(service.editIntake(db, CO, intake.id, { notes: "x", expectedVersion: 1 }, CLERK));
  check("edit against a stale version → CONFLICT", stale?.code === "CONFLICT");
  const resolved = await service.editIntake(db, CO, intake.id, { customerId: "c-twin1", resolveLines: [{ lineId: exception.lines[0].id, productId: "p-dup2" }] }, CLERK);
  check("resolution returns the order to RECEIVED", resolved.intake.status === "RECEIVED" && resolved.lines[0].match_rule === "manual" && resolved.lines[0].matched_by === CLERK.userId);
  const revalidated = await validate(db, intake.id);
  check("person's choices survive re-validation → AWAITING_APPROVAL", revalidated.intake.status === "AWAITING_APPROVAL" && revalidated.lines[0].product_id === "p-dup2" && revalidated.intake.customer_id === "c-twin1");
}

section("Handoff is idempotent and fails safely");
{
  const db = createFakeSupabase(seed());
  db.tables.vyron_workspaces[0].default_vat_rate = null;
  const { intake } = await receive(db, manual());
  const validated = await validate(db, intake.id);
  const failed = await rejects(act(db, intake.id, "approve", { validationHash: validated.intake.validation_hash }));
  const stuck = await service.getIntakeDetail(db, CO, intake.id);
  check("missing VAT setting → HANDOFF_FAILED, order stays APPROVED", failed?.code === "HANDOFF_FAILED" && stuck.intake.status === "APPROVED");
  check("handoff failure is audited", stuck.events.some((e) => e.event_type === "HANDOFF_FAILED"));
  check("no sales order written", db.tables.vyron_customer_sales_orders.length === 0);
  db.tables.vyron_workspaces[0].default_vat_rate = 15;
  const retried = await act(db, intake.id, "confirm");
  check("confirm retries the handoff → CONFIRMED", retried.intake.status === "CONFIRMED" && db.tables.vyron_customer_sales_orders.length === 1);

  // A crash after the sales order was written but before the intake was linked.
  const db2 = createFakeSupabase(seed());
  const second = await receive(db2, manual());
  const v2 = await validate(db2, second.intake.id);
  const row = db2.tables.vyron_order_intakes.find((r) => r.id === second.intake.id);
  const preClaimed = "33333333-3333-4333-8333-333333333333";
  Object.assign(row, { status: "APPROVED", pending_sales_order_id: preClaimed });
  db2.tables.vyron_customer_sales_orders.push({ id: preClaimed, company_id: CO, order_number: "SO-CRASHED", status: "Draft" });
  db2.tables.vyron_customer_sales_order_lines.push({ id: "sol-x", company_id: CO, sales_order_id: preClaimed, product_id: "p-pie", quantity: 10 });
  const linked = await act(db2, second.intake.id, "confirm");
  check("retry links the already-written order instead of creating another", linked.intake.sales_order_id === preClaimed && db2.tables.vyron_customer_sales_orders.length === 1);
  check("confirmed state requires the link", linked.intake.status === "CONFIRMED" && v2.intake.id === second.intake.id);

  const db3 = createFakeSupabase(seed());
  const third = await receive(db3, manual());
  await validate(db3, third.intake.id);
  const row3 = db3.tables.vyron_order_intakes.find((r) => r.id === third.intake.id);
  Object.assign(row3, { status: "APPROVED", pending_sales_order_id: "44444444-4444-4444-8444-444444444444" });
  db3.tables.vyron_customer_sales_orders.push({ id: "44444444-4444-4444-8444-444444444444", company_id: CO, order_number: "SO-HALF", status: "Draft" });
  const half = await rejects(act(db3, third.intake.id, "confirm"));
  check("a half-written sales order (no lines) is not linked", half?.code === "HANDOFF_FAILED" && db3.tables.vyron_order_intakes.find((r) => r.id === third.intake.id).status === "APPROVED");
}

section("Compare-and-set");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual());
  const validated = await validate(db, intake.id);
  // Simulate a second approver who moved the order after this request read it.
  const originalFrom = db.from.bind(db);
  let intercepted = false;
  db.from = (table) => {
    const query = originalFrom(table);
    if (table === "vyron_order_intakes" && !intercepted) {
      const update = query.update.bind(query);
      query.update = (patch) => {
        if (patch.status === "APPROVED" && !intercepted) {
          intercepted = true;
          const row = db.tables.vyron_order_intakes.find((r) => r.id === intake.id);
          row.version += 1;
          row.status = "ON_HOLD";
        }
        return update(patch);
      };
    }
    return query;
  };
  const lost = await rejects(act(db, intake.id, "approve", { validationHash: validated.intake.validation_hash }));
  check("a concurrent change makes the approval a CONFLICT", lost?.code === "CONFLICT");
  check("the loser created no sales order", db.tables.vyron_customer_sales_orders.length === 0);
}

section("Tenant isolation");
{
  const db = createFakeSupabase(seed());
  const { intake } = await receive(db, manual());
  const read = await rejects(service.getIntakeDetail(db, CO_B, intake.id));
  check("another tenant cannot read the order (NOT_FOUND)", read?.code === "NOT_FOUND" && read.status === 404);
  const action = await rejects(service.performIntakeAction(db, CO_B, intake.id, "validate", CLERK, { today: TODAY }));
  check("another tenant cannot act on the order", action?.code === "NOT_FOUND");
  const edit = await rejects(service.editIntake(db, CO_B, intake.id, { notes: "x" }, CLERK));
  check("another tenant cannot edit the order", edit?.code === "NOT_FOUND");
  const listB = await service.listIntakes(db, CO_B, { view: "all" });
  check("another tenant's list does not include it", listB.rows.length === 0 && listB.counts.RECEIVED === 0);
  const listA = await service.listIntakes(db, CO, { view: "inbox" });
  check("own list includes it with line count", listA.rows.length === 1 && listA.rows[0].line_count === 1 && listA.counts.RECEIVED === 1);
  check("every intake/line/event row carries the company", [...db.tables.vyron_order_intakes, ...db.tables.vyron_order_intake_lines, ...db.tables.vyron_order_intake_events].every((r) => r.company_id === CO));
}

section("Missing migration answers NOT_ENABLED");
{
  const db = createFakeSupabase(seed(), { missingTables: ["vyron_order_intakes"] });
  const error = await rejects(service.listIntakes(db, CO, {}));
  check("list without the table → NOT_ENABLED (503)", error?.code === "NOT_ENABLED" && error.status === 503);
}

// ---------------------------------------------------------------------------
section("CSV adapter");
{
  const csv = "Customer,PO Number,Requested Delivery Date,SKU,Description,Qty,Unit Price\nAcme Deli,PO-77,2026-10-02,PIE-150,Steak pie,10,20.00\nAcme Deli,PO-77,2026-10-02,ABC-9,Lower,2,30\n";
  const candidate = parseCsvOrder({ text: csv, fileName: "acme.csv" });
  check("csv header fields read", candidate.customerName === "Acme Deli" && candidate.customerPoNumber === "PO-77" && candidate.requestedDeliveryDate === "2026-10-02");
  check("csv lines read with row references", candidate.lines.length === 2 && candidate.lines[0].sourceLineReference === "row-2" && candidate.lines[1].unitPrice === 30);
  check("csv source key is the content hash", candidate.sourceKey === `sha256:${normalize.stableHash(csv)}`);
  const contradiction = await rejects(Promise.resolve().then(() => parseCsvOrder({ text: "customer,sku,qty\nA,X,1\nB,Y,1\n" })));
  check("contradictory customers refused", contradiction && /contradicts/.test(contradiction.message));
  const noQty = await rejects(Promise.resolve().then(() => parseCsvOrder({ text: "sku,description\nX,Y\n" })));
  check("missing quantity column refused", noQty && /quantity/.test(noQty.message));
  const badQty = await rejects(Promise.resolve().then(() => parseCsvOrder({ text: "sku,qty\nX,ten\n" })));
  check("non-numeric quantity refused with row number", badQty && /Row 2/.test(badQty.message));
  const injected = parseCsvOrder({ text: "sku,description,qty\nX,=HYPERLINK(\"http://evil\"),1\n" });
  check("formula injection neutralised", !String(injected.lines[0].description).startsWith("="));
  const badDate = await rejects(Promise.resolve().then(() => parseCsvOrder({ text: "sku,qty,delivery_date\nX,1,02/10/2026\n" })));
  check("non-ISO date refused (no locale guessing)", badDate && /YYYY-MM-DD/.test(badDate.message));

  const db = createFakeSupabase(seed());
  const first = await receive(db, candidate);
  const second = await receive(db, parseCsvOrder({ text: csv, fileName: "acme (copy).csv" }));
  check("the same file uploaded twice is one order", second.duplicate && second.intake.id === first.intake.id);
}

section("Manual adapter (untrusted body)");
{
  const candidate = manualOrderAdapter.normalize({ source: "shopify", customerName: " Acme Deli ", idempotencyKey: "k1", lines: [{ sku: "PIE-150", quantity: "3", unitPrice: "20", costPerUnit: 1 }], companyId: CO_B });
  check("source forced to manual whatever the body says", candidate.source === "manual");
  check("only named fields read (no cost, no company)", !("costPerUnit" in candidate.lines[0]) && !("companyId" in candidate));
  check("values coerced", candidate.lines[0].quantity === 3 && candidate.lines[0].unitPrice === 20 && candidate.customerName === "Acme Deli");
}

section("E-mail boundary (not connected)");
{
  const db = createFakeSupabase(seed());
  const message = {
    messageId: "<abc123@mail.test>",
    provider: "test",
    from: "Orders@Acme.test",
    to: ["orders@vyron.test"],
    subject: "Order for Friday",
    receivedAt: "2026-09-22T08:00:00Z",
    bodyText: "Please see attached.",
    attachments: [{ fileName: "order.csv", contentType: "text/csv", sizeBytes: 60, text: "sku,qty,price\nPIE-150,4,20\n" }],
  };
  const result = await receiveInboundEmail(db, CO, message, CLERK);
  check("csv attachment → one order, message PARSED", result.status === "PARSED" && result.orders.length === 1 && result.orders[0].intake.source === "email");
  const msgRow = db.tables.vyron_order_source_messages[0];
  check("envelope stored, attachment bytes not stored", msgRow.message_id === "<abc123@mail.test>" && msgRow.from_address === "orders@acme.test" && !("text" in msgRow.attachments[0]));
  check("order links back to the message", result.orders[0].intake.source_message_id === msgRow.id && msgRow.intake_id === result.orders[0].intake.id);
  const detail = await validate(db, result.orders[0].intake.id);
  check("customer resolved from sender e-mail — with a warning", detail.intake.customer_id === "c-acme" && codes(detail).includes("CUSTOMER_MATCHED_BY_EMAIL"));
  const redelivered = await receiveInboundEmail(db, CO, message, CLERK);
  check("the same message twice is stored once, no second order", redelivered.duplicate && db.tables.vyron_order_intakes.length === 1 && db.tables.vyron_order_source_messages.length === 1);
  const noAttachment = await receiveInboundEmail(db, CO, { ...message, messageId: "<m2>", attachments: [] }, CLERK);
  check("no attachment → NO_ORDER_FOUND, nothing guessed", noAttachment.status === "NO_ORDER_FOUND" && db.tables.vyron_order_intakes.length === 1);
  const pdfOnly = await receiveInboundEmail(db, CO, { ...message, messageId: "<m3>", attachments: [{ fileName: "po.pdf", contentType: "application/pdf", sizeBytes: 900 }] }, CLERK);
  check("PDF-only → NO_ORDER_FOUND (PDF not read automatically yet)", pdfOnly.status === "NO_ORDER_FOUND");
  const broken = await receiveInboundEmail(db, CO, { ...message, messageId: "<m4>", attachments: [{ fileName: "x.csv", contentType: "text/csv", sizeBytes: 5, text: "sku\nX\n" }] }, CLERK);
  check("unreadable CSV → FAILED with reason", broken.status === "FAILED" && /quantity/.test(broken.reason));
  const invalid = await rejects(receiveInboundEmail(db, CO, { ...message, messageId: "" }, CLERK));
  check("message without id refused", invalid?.code === "INVALID_INPUT");
}

section("WooCommerce and Shopify normalisers (not connected)");
{
  check("adapters declare they are not connected", platforms.wooCommerceOrderAdapter.connected === false && platforms.shopifyOrderAdapter.connected === false);
  const woo = platforms.normalizeWooCommerceOrder({
    storeKey: "store-a",
    order: {
      id: 501, number: "501", status: "processing", currency: "ZAR", date_created: "2026-09-20T10:00:00",
      customer_id: 77, billing: { email: "x@y.test", first_name: "Pat", last_name: "Lee" }, total: "115.00", total_tax: "15.00", discount_total: "10.00",
      line_items: [{ id: 9, product_id: 3, variation_id: 0, sku: "PIE-150", name: "Steak Pie", quantity: 5, price: 18, subtotal: "100.00", total: "90.00", total_tax: "13.50" }],
    },
  });
  check("woo: source key includes store and order id", woo.sourceKey === "store-a:order:501" && woo.source === "woocommerce");
  check("woo: platform customer is a reference only", woo.customerReference === "woocommerce:store-a:customer:77" && !woo.customerId);
  const wl = woo.lines[0];
  check("woo: discount counted once (qty×price − discount = total)", wl.unitPrice === 20 && wl.discountAmount === 10 && 5 * wl.unitPrice - wl.discountAmount === 90);
  check("woo: line reference from line id", wl.sourceLineReference === "line:9");
  const refusedWoo = await rejects(Promise.resolve().then(() => platforms.normalizeWooCommerceOrder({ storeKey: "a", order: { id: 1, status: "refunded", line_items: [{ sku: "X", quantity: 1 }] } })));
  check("woo: refunded orders refused", refusedWoo && /refunded/.test(refusedWoo.message));
  const noStore = await rejects(Promise.resolve().then(() => platforms.normalizeWooCommerceOrder({ storeKey: " ", order: { id: 1, line_items: [{ quantity: 1 }] } })));
  check("store key required", noStore && /store key/.test(noStore.message));
  const shop = platforms.normalizeShopifyOrder({
    storeKey: "store-b",
    order: { id: 9001, name: "#1001", created_at: "2026-09-21T09:00:00Z", currency: "ZAR", financial_status: "paid", customer: { id: 55 }, subtotal_price: "40.00", total_price: "46.00", total_tax: "6.00", line_items: [{ id: 1, sku: "ABC-9", name: "Lower", quantity: 2, price: "20.00", total_discount: "0.00" }] },
  });
  check("shopify: mapping", shop.sourceKey === "store-b:order:9001" && shop.externalOrderNumber === "#1001" && shop.lines[0].unitPrice === 20 && shop.lines[0].discountAmount === null);
  const cancelled = await rejects(Promise.resolve().then(() => platforms.normalizeShopifyOrder({ storeKey: "b", order: { id: 2, cancelled_at: "2026-09-01", line_items: [{ quantity: 1 }] } })));
  check("shopify: cancelled orders refused", cancelled && /cancelled/.test(cancelled.message));
  const db = createFakeSupabase(seed());
  const r1 = await receive(db, woo);
  const r2 = await receive(db, platforms.normalizeWooCommerceOrder({ storeKey: "store-other", order: { id: 501, status: "processing", line_items: [{ id: 9, sku: "PIE-150", quantity: 1 }] } }));
  check("same order id in two stores → two orders", !r2.duplicate && r1.intake.id !== r2.intake.id);
  const r3 = await receive(db, woo);
  check("same platform order again → duplicate", r3.duplicate && r3.intake.id === r1.intake.id);
}

check("errors are OrderEngineError instances", new OrderEngineError("NOT_FOUND", "x") instanceof Error);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
