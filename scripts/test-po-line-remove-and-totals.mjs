#!/usr/bin/env node
/**
 * VOLORA — purchase order product lines can be removed one at a time, and every
 * line shows its own line total on screen, on reopen and on the PDF.
 *
 * DEFECTS THIS LOCKS DOWN (2026-11-13, client request)
 * ---------------------------------------------------
 * 1. Line totals read back as R0.00 everywhere. In production
 *    vyron_cost_purchase_order_lines.line_total is GENERATED ALWAYS from the
 *    legacy unit_cost column. Saves wrote unit_price only, the insert was refused
 *    for line_total, and the retry dropped line_total AND vat_amount — so every
 *    stored line had unit_cost 0, line_total 0 and vat_amount 0 (398 of 398
 *    priced production lines, measured read-only on 2026-11-13). The header
 *    totals were right; the lines on the detail screen and PDF were not.
 * 2. A zero-rated line reopened as 15% VAT (`vat_rate || 15`).
 * 3. The PO form had no way to remove a line, and no line total.
 *
 * The line-table double below behaves like production: it refuses a supplied
 * line_total and derives line_excl / line_vat / line_total from unit_cost.
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data, nothing is e-mailed.
 *
 *   npm run test:po-line-remove-and-totals
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

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
const money = (n) => Math.round(Number(n) * 100) / 100;
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10), U_BUYER = uuid("a", 11), U_VIEW = uuid("a", 12);

const MEMBERS = [
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", "Synthetic", "Owner"],
  [U_BUYER, "buyer@qa-a.test", WS_A, "PROCUREMENT", "Synthetic", "Buyer"],
  [U_VIEW, "view@qa-a.test", WS_A, "VIEW_ONLY", "Synthetic", "Viewer"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));

const po = (id, company, number, status, extra = {}) => ({
  id, company_id: company, po_number: number, supplier_id: null, supplier_name_snapshot: "QA Supplier", status,
  order_date: "2026-11-13", subtotal: 1000, vat_amount: 150, total: 1150, expected_total: 1150, outstanding_amount: 1150,
  notes: null, created_at: "2026-11-13T08:00:00Z", updated_at: "2026-11-13T08:00:00Z", ...extra,
});
// Stored exactly as production stores lines today: unit_cost, line_total and vat_amount all 0.
const legacyLine = (id, poId, company, extra = {}) => ({
  id, purchase_order_id: poId, company_id: company, item_type: "non_stock", item_name: "Flour 25kg", quantity: 10, ordered_qty: 10,
  unit: "bag", unit_price: 100, unit_cost: 0, vat_rate: 15, vat_amount: 0, line_excl: 0, line_vat: 0, line_total: 0,
  received_qty: 0, damaged_qty: 0, rejected_qty: 0, outstanding_qty: 10, sort_order: 0, ...extra,
});

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Full", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Full", status: "Setup" },
    ],
    vyron_workspace_memberships: MEMBERS.map(([userId, , ws, role], i) => ({ id: `m${i}`, workspace_id: ws, user_id: userId, role, status: "Active", permissions: {} })),
    vyron_user_profiles: MEMBERS.map(([id, email, , , first_name, surname]) => ({ id, email, first_name, surname })),
    // Threshold 0 keeps "Submitted" a real approval step (no auto-approve).
    vyron_po_approval_rules: [
      { id: "r-a", company_id: CO_A, auto_approve_below: 0, supervisor_approve_below: 25000, require_po_before_invoice_approval: false },
    ],
    vyron_cost_purchase_orders: [
      po("po-legacy", CO_A, "PO-LEGACY", "Draft"),
      po("po-appr", CO_A, "PO-APPR", "Approved", { approved_by: "Original Approver" }),
      po("po-sent", CO_A, "PO-SENT", "Sent"),
      po("po-recv", CO_A, "PO-RECV", "Submitted"),
      po("po-rej", CO_A, "PO-REJ", "Rejected"),
    ],
    vyron_cost_purchase_order_lines: [
      legacyLine("l-legacy-1", "po-legacy", CO_A),
      legacyLine("l-legacy-2", "po-legacy", CO_A, { item_name: "Exempt eggs", quantity: 3, ordered_qty: 3, unit: "tray", unit_price: 45.5, vat_rate: 0, sort_order: 1 }),
      legacyLine("l-appr-1", "po-appr", CO_A),
      legacyLine("l-appr-2", "po-appr", CO_A, { item_name: "Sugar", sort_order: 1 }),
      legacyLine("l-sent-1", "po-sent", CO_A),
      legacyLine("l-sent-2", "po-sent", CO_A, { item_name: "Sugar", sort_order: 1 }),
      legacyLine("l-recv-1", "po-recv", CO_A, { received_qty: 4, outstanding_qty: 6 }),
      legacyLine("l-recv-2", "po-recv", CO_A, { item_name: "Sugar", sort_order: 1 }),
      legacyLine("l-rej-1", "po-rej", CO_A),
      legacyLine("l-rej-2", "po-rej", CO_A, { item_name: "Sugar", sort_order: 1 }),
    ],
    vyron_procurement_audit_log: [],
    vyron_cost_suppliers: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

const errorChain = (error) => {
  const result = { data: null, error };
  const chain = new Proxy({}, { get: (_, prop) => (prop === "then" ? (resolve) => resolve(result) : () => chain) });
  return chain;
};

/** Production's line table: line_* are GENERATED from unit_cost; optionally no unit_cost column at all. */
function emulateProductionLineTable(db, { withoutUnitCost = false } = {}) {
  const from = db.from.bind(db);
  db.insertAttempts = [];
  db.from = (table) => {
    const query = from(table);
    if (table !== "vyron_cost_purchase_order_lines") return query;
    const insert = query.insert.bind(query);
    query.insert = (payload) => {
      const items = Array.isArray(payload) ? payload : [payload];
      db.insertAttempts.push(Object.keys(items[0] || {}).sort());
      for (const column of ["line_total", "line_excl", "line_vat"]) {
        if (items.some((item) => column in item)) {
          return errorChain({ code: "428C9", message: `cannot insert a non-DEFAULT value into column "${column}"` });
        }
      }
      if (withoutUnitCost && items.some((item) => "unit_cost" in item)) {
        return errorChain({ code: "PGRST204", message: "Could not find the 'unit_cost' column of 'vyron_cost_purchase_order_lines' in the schema cache" });
      }
      const derived = items.map((item) => {
        const q = Number(item.quantity || 0);
        const c = withoutUnitCost ? 0 : Number(item.unit_cost || 0);
        const v = Number(item.vat_rate ?? 15);
        return { ...item, line_excl: q * c, line_vat: (q * c * v) / 100, line_total: q * c * (1 + v / 100) };
      });
      return insert(Array.isArray(payload) ? derived : derived[0]);
    };
    return query;
  };
}

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function resetDb(options) {
  db = createFakeSupabase(seed(), { honourOrder: true });
  emulateProductionLineTable(db, options);
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const rows = (table) => db.tables[table] || [];
const linesOf = (poId) => rows("vyron_cost_purchase_order_lines").filter((r) => r.purchase_order_id === poId);
const auditOf = (poId, eventType) => rows("vyron_procurement_audit_log").filter((r) => r.entity_id === poId && (!eventType || r.event_type === eventType));
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const poListRoute = await importFromRoot("src/app/api/purchase-orders/route.ts");
const poItemRoute = await importFromRoot("src/app/api/purchase-orders/[id]/route.ts");
const poPdfRoute = await importFromRoot("src/app/api/purchase-orders/[id]/pdf/route.ts");
const { buildPurchaseOrderDocumentModel } = await importFromRoot("src/lib/platform/documents/adapters/purchase-order.ts");
const procurement = await importFromRoot("src/lib/vyron-procurement.ts");
const engine = await importFromRoot("src/lib/vyron-purchase-order-engine.ts");

async function login(userId) {
  const user = USERS.find((u) => u.id === userId);
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: user.email, password: user.password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, url, { method = "POST", id, body } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": "application/json" } };
  if (method !== "GET") init.body = JSON.stringify(body ?? {});
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = await quietly(() => (id === undefined ? handler(request) : handler(request, { params: Promise.resolve({ id }) })));
  let json = null;
  const type = res.headers.get("content-type") || "";
  if (type.includes("json")) json = await res.json().catch(() => null);
  return { status: res.status, json, type, res };
}
const createPo = (jar, body) => call(jar, poListRoute.POST, "/api/purchase-orders", { body });
const savePo = (jar, id, body) => call(jar, poItemRoute.PUT, `/api/purchase-orders/${id}`, { method: "PUT", id, body });
const openPo = (jar, id) => call(jar, poItemRoute.GET, `/api/purchase-orders/${id}`, { method: "GET", id });
const pdfPo = (jar, id) => call(jar, poPdfRoute.GET, `/api/purchase-orders/${id}/pdf`, { method: "GET", id });

/** What the form sends: the loaded lines, minus the removed ones, with their saved ids. */
const formLines = (lines) =>
  lines.map((l) => ({
    id: l.id, item_type: l.item_type, item_id: l.item_id, item_name: l.item_name, quantity: l.quantity, unit: l.unit,
    unit_price: l.unit_price, vat_rate: l.vat_rate, expected_delivery_date: l.expected_delivery_date || "",
  }));
const header = (purchaseOrder, extra = {}) => ({
  po_number: purchaseOrder.po_number, supplier_id: purchaseOrder.supplier_id, supplier_name_snapshot: purchaseOrder.supplier_name_snapshot,
  status: purchaseOrder.status, order_date: purchaseOrder.order_date, notes: purchaseOrder.notes || "", ...extra,
});
const expected = (q, p, v) => {
  const ex = money(q * p);
  const vat = money(ex * (v / 100));
  return { ex, vat, total: money(ex + vat) };
};
function linesAgreeWithHeader(purchaseOrder) {
  const lines = purchaseOrder.lines || [];
  const total = money(lines.reduce((s, l) => s + Number(l.line_total), 0));
  const vat = money(lines.reduce((s, l) => s + Number(l.vat_amount), 0));
  return eq(total, purchaseOrder.total) && eq(vat, purchaseOrder.vat_amount) && eq(total - vat, purchaseOrder.subtotal);
}

resetDb();
const jar = {};
for (const [userId] of MEMBERS) jar[userId] = await login(userId);

/* ------------------------------------------------------------------ */
section("1-2. Create a PO with several products; every line carries its own line total");
const created = await createPo(jar[U_BUYER], {
  po_number: "PO-QA-0001", supplier_id: null, supplier_name_snapshot: "QA Supplier", status: "Draft", order_date: "2026-11-13", notes: "",
  lines: [
    { item_type: "ingredient", item_name: "Cake flour 10kg", quantity: 12, unit: "bag", unit_price: 189.99, vat_rate: 15 },
    { item_type: "packaging", item_name: "Pie box 9in", quantity: 250, unit: "each", unit_price: 3.4567, vat_rate: 15 },
    { item_type: "ingredient", item_name: "Fresh eggs", quantity: 7.5, unit: "tray", unit_price: 52.1, vat_rate: 0 },
    { item_type: "non_stock", item_name: "Cleaning cloths", quantity: 3, unit: "pack", unit_price: 41.3, vat_rate: 15 },
  ],
});
check("PO created", created.status === 200 && created.json?.ok, JSON.stringify(created.json));
let order = created.json?.purchaseOrder;
const poId = order?.id;
const want = [expected(12, 189.99, 15), expected(250, 3.4567, 15), expected(7.5, 52.1, 0), expected(3, 41.3, 15)];
check("four lines returned", order?.lines?.length === 4);
order?.lines?.forEach((line, i) => {
  check(`line ${i + 1} (${line.item_name}) line total R${want[i].total} incl. VAT`, eq(line.line_total, want[i].total), `got ${line.line_total}`);
  check(`line ${i + 1} VAT R${want[i].vat}`, eq(line.vat_amount, want[i].vat), `got ${line.vat_amount}`);
});
check("zero-rated line keeps 0% VAT", order?.lines?.[2]?.vat_rate === 0, `got ${order?.lines?.[2]?.vat_rate}`);
check("line totals add up to subtotal, VAT and grand total", order && linesAgreeWithHeader(order), JSON.stringify({ s: order?.subtotal, v: order?.vat_amount, t: order?.total }));
check("grand total is the sum of the expected line totals", eq(order?.total, money(want.reduce((s, w) => s + w.total, 0))), `got ${order?.total}`);

section("Stored rows: generated columns now derive from unit_cost; VAT is stored");
const stored = linesOf(poId);
check("unit_cost written equal to unit_price on every line", stored.length === 4 && stored.every((r) => r.unit_cost === r.unit_price));
check("database line_total (generated) is no longer 0", stored.every((r) => Number(r.line_total) > 0));
check("database line_total agrees with the app to the cent", stored.every((r) => Math.abs(Number(r.line_total) - want[r.sort_order].total) < 0.011));
check("vat_amount stored (no longer dropped by the retry)", stored.filter((r) => r.vat_rate > 0).every((r) => Number(r.vat_amount) > 0));
check("only the generated column was dropped on retry", db.insertAttempts.at(-1).includes("vat_amount") && db.insertAttempts.at(-1).includes("unit_cost") && !db.insertAttempts.at(-1).includes("line_total"), JSON.stringify(db.insertAttempts.at(-1)));

/* ------------------------------------------------------------------ */
section("3-4. Change a quantity and a unit price — those line totals change, others do not");
let opened = (await openPo(jar[U_BUYER], poId)).json?.purchaseOrder;
let edited = formLines(opened.lines);
edited[0].quantity = 20;
edited[1].unit_price = 2.99;
let saved = await savePo(jar[U_BUYER], poId, { ...header(opened), lines: edited });
check("save accepted", saved.status === 200 && saved.json?.ok, JSON.stringify(saved.json));
order = saved.json?.purchaseOrder;
check("quantity change: line 1 total recalculated", eq(order?.lines?.[0]?.line_total, expected(20, 189.99, 15).total), `got ${order?.lines?.[0]?.line_total}`);
check("price change: line 2 total recalculated", eq(order?.lines?.[1]?.line_total, expected(250, 2.99, 15).total), `got ${order?.lines?.[1]?.line_total}`);
check("untouched lines 3 and 4 unchanged", eq(order?.lines?.[2]?.line_total, want[2].total) && eq(order?.lines?.[3]?.line_total, want[3].total));
check("header totals follow the edited lines", order && linesAgreeWithHeader(order));

/* ------------------------------------------------------------------ */
section("5-7. Remove one product line — the others stay intact, totals recalculate");
opened = (await openPo(jar[U_BUYER], poId)).json?.purchaseOrder;
const before = opened.lines.map((l) => ({ id: l.id, name: l.item_name, q: l.quantity, p: l.unit_price, v: l.vat_rate, t: l.line_total }));
const removedLine = opened.lines[1];
saved = await savePo(jar[U_BUYER], poId, { ...header(opened), lines: formLines(opened.lines.filter((l) => l.id !== removedLine.id)) });
check("save after removal accepted", saved.status === 200 && saved.json?.ok, JSON.stringify(saved.json));
order = saved.json?.purchaseOrder;
check("three lines remain", order?.lines?.length === 3);
const after = (order?.lines || []).map((l) => ({ id: l.id, name: l.item_name, q: l.quantity, p: l.unit_price, v: l.vat_rate, t: l.line_total }));
check(
  "remaining lines keep their id, item, quantity, price, VAT and line total",
  JSON.stringify(after) === JSON.stringify(before.filter((l) => l.id !== removedLine.id)),
  `${JSON.stringify(after)}\n       vs ${JSON.stringify(before.filter((l) => l.id !== removedLine.id))}`
);
check("subtotal, VAT and grand total recalculated without the removed line", order && linesAgreeWithHeader(order) && eq(order.total, money(before.filter((l) => l.id !== removedLine.id).reduce((s, l) => s + l.t, 0))));
check("PO number and identity unchanged", order?.id === poId && order?.po_number === "PO-QA-0001");
check("still one purchase order (no copy created)", rows("vyron_cost_purchase_orders").filter((r) => r.po_number === "PO-QA-0001").length === 1);
const removal = auditOf(poId, "PO Line Removed");
check("removal written to the procurement audit trail once", removal.length === 1, JSON.stringify(removal));
check("audit names the product, quantity and value", removal[0]?.metadata?.item_name === "Pie box 9in" && removal[0]?.metadata?.quantity === 250 && eq(removal[0]?.metadata?.line_total, expected(250, 2.99, 15).total), JSON.stringify(removal[0]?.metadata));
check("audit records the verified member, not 'user'", removal[0]?.actor === "Synthetic Buyer", `got ${removal[0]?.actor}`);
check("audit row is timestamped", Boolean(removal[0]?.created_at));
check("audit detail reads clearly", /Removed Pie box 9in \(250 each\) from PO-QA-0001\./.test(removal[0]?.detail || ""), removal[0]?.detail);

/* ------------------------------------------------------------------ */
section("8-10. Save and reopen — the removed product stays removed, figures intact");
const reopened = (await openPo(jar[U_OWNER], poId)).json?.purchaseOrder;
check("reopened PO has three lines", reopened?.lines?.length === 3);
check("removed product does not reappear", !reopened?.lines?.some((l) => l.id === removedLine.id || l.item_name === "Pie box 9in"));
check(
  "reopened quantities, prices and line totals are what was saved",
  JSON.stringify(reopened?.lines?.map((l) => ({ id: l.id, name: l.item_name, q: l.quantity, p: l.unit_price, v: l.vat_rate, t: l.line_total }))) === JSON.stringify(after)
);
check("reopened lines agree with reopened header totals", reopened && linesAgreeWithHeader(reopened));

section("Remove several lines individually in one edit");
saved = await savePo(jar[U_BUYER], poId, {
  ...header(reopened),
  lines: [...formLines(reopened.lines.slice(0, 1)), { item_type: "non_stock", item_name: "Twine", quantity: 2, unit: "roll", unit_price: 15, vat_rate: 15 }],
});
order = saved.json?.purchaseOrder;
check("two more lines removed, one added, one kept", saved.json?.ok && order?.lines?.length === 2 && order.lines[0].id === reopened.lines[0].id);
check("each removed line audited separately", auditOf(poId, "PO Line Removed").length === 3);
check("totals agree after multiple removals", order && linesAgreeWithHeader(order));
const noRemovalSave = await savePo(jar[U_BUYER], poId, { ...header(order), lines: formLines(order.lines) });
check("a save that removes nothing writes no removal audit", noRemovalSave.json?.ok && auditOf(poId, "PO Line Removed").length === 3);

/* ------------------------------------------------------------------ */
section("11. PO PDF / document shows every line total, matching the totals");
const model = await buildPurchaseOrderDocumentModel(db, CO_A, poId);
check("document has a Line Total column", model?.lineColumns?.some((c) => c.key === "lineTotal" && c.label === "Line Total"));
check("every PDF line total equals the on-screen line total", model?.lineRows?.length === 2 && model.lineRows.every((r, i) => r.lineTotal === Number(order.lines[i].line_total).toFixed(2)), JSON.stringify(model?.lineRows));
check("no PDF line shows 0.00", model?.lineRows?.every((r) => r.lineTotal !== "0.00"));
check("PDF line totals add up to the grand total", eq(model?.lineRows?.reduce((s, r) => s + Number(r.lineTotal), 0), model?.totals?.grandTotal));
const pdf = await pdfPo(jar[U_BUYER], poId);
const pdfBytes = pdf.status === 200 ? Buffer.from(await pdf.res.arrayBuffer()) : Buffer.alloc(0);
check("PDF route returns a PDF", pdf.status === 200 && pdf.type.includes("application/pdf") && pdfBytes.subarray(0, 5).toString() === "%PDF-", `status ${pdf.status} ${pdf.type}`);

section("Existing (legacy) lines stored with line_total 0 now display correctly — no data change");
const legacy = (await openPo(jar[U_BUYER], "po-legacy")).json?.purchaseOrder;
check("legacy line 1 shows R1150.00 (10 x R100 + 15%)", eq(legacy?.lines?.[0]?.line_total, 1150), `got ${legacy?.lines?.[0]?.line_total}`);
check("legacy zero-rated line shows R136.50 at 0% VAT", eq(legacy?.lines?.[1]?.line_total, 136.5) && legacy?.lines?.[1]?.vat_rate === 0, JSON.stringify(legacy?.lines?.[1]));
check("legacy rows in the database untouched by reading", linesOf("po-legacy").every((r) => r.line_total === 0 && r.unit_cost === 0));
const legacyModel = await buildPurchaseOrderDocumentModel(db, CO_A, "po-legacy");
check("legacy PDF line totals are 1150.00 and 136.50", legacyModel?.lineRows?.map((r) => r.lineTotal).join(",") === "1150.00,136.50", JSON.stringify(legacyModel?.lineRows));
const engineDetail = await engine.getPurchaseOrderEngineDetail(db, CO_A, "po-legacy");
check("PO engine detail shows the same line totals", engineDetail?.lines?.map((l) => l.line_total).join(",") === "1150,136.5", JSON.stringify(engineDetail?.lines?.map((l) => l.line_total)));

/* ------------------------------------------------------------------ */
section("12. Approved / sent / received POs keep their existing controls");
for (const [id, label] of [["po-appr", "Approved"], ["po-sent", "Sent"], ["po-recv", "goods received"]]) {
  const current = (await openPo(jar[U_OWNER], id)).json?.purchaseOrder;
  const linesBefore = JSON.stringify(linesOf(id));
  const attempt = await savePo(jar[U_OWNER], id, { ...header(current, { status: "Draft" }), lines: formLines(current.lines.slice(0, 1)) });
  check(`${label} PO: line removal refused with 409`, attempt.status === 409 && attempt.json?.ok === false, `${attempt.status} ${JSON.stringify(attempt.json)}`);
  check(`${label} PO: lines unchanged`, JSON.stringify(linesOf(id)) === linesBefore);
  check(`${label} PO: no removal audited`, auditOf(id, "PO Line Removed").length === 0);
}
const rejected = (await openPo(jar[U_BUYER], "po-rej")).json?.purchaseOrder;
const amend = await savePo(jar[U_BUYER], "po-rej", { ...header(rejected, { status: "Draft" }), lines: formLines(rejected.lines.slice(0, 1)) });
check("a rejected (handed back) PO can be amended by removing a line", amend.status === 200 && amend.json?.purchaseOrder?.lines?.length === 1, JSON.stringify(amend.json));
check("amended PO keeps its number", amend.json?.purchaseOrder?.po_number === "PO-REJ");

section("Permissions unchanged");
const viewerOpen = await openPo(jar[U_VIEW], "po-legacy");
const viewerSave = await savePo(jar[U_VIEW], "po-legacy", { ...header(legacy), lines: formLines(legacy.lines.slice(0, 1)) });
check("view-only member can open a PO", viewerOpen.status === 200);
check("view-only member cannot remove a line", viewerSave.status === 401 || viewerSave.status === 403, `got ${viewerSave.status}`);
check("view-only attempt left the lines alone", linesOf("po-legacy").length === 2 && auditOf("po-legacy").length === 0);

/* ------------------------------------------------------------------ */
section("Schemas without the unit_cost column still save");
resetDb({ withoutUnitCost: true });
const jarB = await login(U_BUYER);
const noCost = await createPo(jarB, {
  po_number: "PO-QA-NOCOST", supplier_name_snapshot: "QA Supplier", status: "Draft", order_date: "2026-11-13",
  lines: [{ item_type: "non_stock", item_name: "Twine", quantity: 2, unit: "roll", unit_price: 15, vat_rate: 15 }],
});
check("save succeeds after dropping unit_cost", noCost.json?.ok && noCost.json.purchaseOrder.lines.length === 1, JSON.stringify(noCost.json));
check("line total still shown from quantity x price", eq(noCost.json?.purchaseOrder?.lines?.[0]?.line_total, 34.5));

section("refusedPoLineColumn reads the database's refusal");
const r = procurement.refusedPoLineColumn;
check("generated line_total", r('cannot insert a non-DEFAULT value into column "line_total"') === "line_total");
check("older Postgres wording", r('cannot insert into column "line_total"') === "line_total");
check("missing unit_cost column (PostgREST)", r("Could not find the 'unit_cost' column of 'vyron_cost_purchase_order_lines' in the schema cache") === "unit_cost");
check("missing vat_amount column (Postgres)", r('column "vat_amount" of relation "vyron_cost_purchase_order_lines" does not exist') === "vat_amount");
check("unrelated errors are not retried", r('null value in column "item_name" violates not-null constraint') === null && r("permission denied for table x") === null);
check("required columns are never dropped", r('column "quantity" of relation "x" does not exist') === null);

section("poLineAmounts / poLineVatRate");
check("missing VAT rate defaults to 15%", procurement.poLineVatRate(null) === 15 && procurement.poLineVatRate(undefined) === 15);
check("0% VAT stays 0%", procurement.poLineVatRate(0) === 0 && procurement.poLineVatRate("0") === 0);
check("amounts use calcLineTotals rounding", JSON.stringify(procurement.poLineAmounts({ quantity: 3, unit_price: 0.335, vat_rate: 15 })) === JSON.stringify({ subtotal: 1.01, vat_amount: 0.15, line_total: 1.16 }));

section("PO form: remove action and line totals are wired");
const form = readFileSync(path.join(ROOT, "src/components/ProcurementPoFormClient.tsx"), "utf8");
check("each line has a Remove button", /onClick=\{\(\) => removeLine\(line\.id\)\}/.test(form) && />\s*Remove\s*</.test(form));
check("each line shows a Line Total from calcLineTotals", /calcLineTotals\(line\.quantity, line\.unit_price, line\.vat_rate\)/.test(form) && /lineCalc\.lineTotal\.toFixed\(2\)/.test(form));
check("removal can be undone before saving", /undoRemoveLine/.test(form));
check("locked statuses make lines read-only", /isPoEditableStatus\(status\)/.test(form) && /disabled=\{!canEditLines\}/.test(form));
check("reopened 0% VAT is not turned into 15%", !/vat_rate \|\| 15/.test(form));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
