#!/usr/bin/env node
/**
 * VYRON — a price changed for one customer changes that customer only.
 *
 * KINGDOM FOODS QUERY (2026-11, critical): "When updating a price for one
 * customer, ONLY that customer's price must be updated. No other customer's
 * pricing may change."
 *
 * What was wrong (d76f016): the customer pricing screen saved a price onto
 * whichever list governed the row — a standard or contract list shared by
 * other customers, or the company default — so every customer on that list
 * got the new price. The screen only warned.
 *
 * Now the screen calls PATCH /api/customers/[id]/price, which writes to the
 * customer's own contract list (created, copy-on-write, on first use). This
 * drives that real route and resolveCustomerProductPrice — the resolver sales
 * orders, invoices and the portal use — against an in-memory database.
 *
 *   npm run test:customer-price-isolation
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
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

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO = uuid("a", 1), CO_B = uuid("b", 1), WS = uuid("a", 2);
const U_OWNER = uuid("a", 10);
// Customers: A and B share standard list S; A and C share contract list C; E has no list (company default); F has its own contract list.
const CUST = { A: uuid("c", 1), B: uuid("c", 2), C: uuid("c", 3), E: uuid("c", 5), F: uuid("c", 6), OTHER_CO: uuid("c", 9) };
const LIST = { D: uuid("1", 1), S: uuid("1", 2), C: uuid("1", 3), F: uuid("1", 4) };
const P = { pie: uuid("7", 1), roll: uuid("7", 2), tart: uuid("7", 3) };

const item = (n, list, product, price) => ({ id: uuid("9", n), company_id: CO, price_list_id: list, product_id: product, base_price: price, markup_pct: 0, discount_pct: 0, gp_pct: 0, override_price: price, final_price: price, status: "Active", effective_from: null, effective_to: null });
function seed() {
  return {
    vyron_workspaces: [{ id: WS, company_id: CO, company_name: "QA Foods", package_name: "Enterprise", status: "Setup" }],
    vyron_workspace_memberships: [{ id: "m1", workspace_id: WS, user_id: U_OWNER, role: "OWNER", status: "Active", permissions: {} }],
    vyron_customers: [
      ...Object.entries(CUST).filter(([k]) => k !== "OTHER_CO").map(([k, id]) => ({ id, company_id: CO, customer_name: `QA Customer ${k}` })),
      { id: CUST.OTHER_CO, company_id: CO_B, customer_name: "Other company customer" },
    ],
    vyron_cost_products: Object.entries(P).map(([k, id]) => ({ id, company_id: CO, product_name: `QA ${k}`, status: "Active", selling_price: 999, total_cost: 10 })),
    vyron_customer_price_lists: [
      { id: LIST.D, company_id: CO, list_name: "Company default", list_type: "Standard", status: "Active", is_company_default: true },
      { id: LIST.S, company_id: CO, list_name: "Shared standard", list_type: "Standard", status: "Active", is_company_default: false },
      { id: LIST.C, company_id: CO, list_name: "Shared contract", list_type: "Contract", status: "Active", is_company_default: false },
      { id: LIST.F, company_id: CO, list_name: "F only", list_type: "Contract", status: "Active", is_company_default: false },
    ],
    vyron_customer_price_list_items: [
      item(1, LIST.D, P.pie, 100), item(2, LIST.D, P.roll, 200), item(3, LIST.D, P.tart, 300),
      item(4, LIST.S, P.pie, 90), item(5, LIST.S, P.roll, 180), item(6, LIST.S, P.tart, 280),
      item(7, LIST.C, P.pie, 80), item(8, LIST.C, P.tart, 70),
      item(9, LIST.F, P.pie, 60),
    ],
    vyron_customer_price_list_assignments: [
      { id: uuid("8", 1), company_id: CO, customer_id: CUST.A, default_price_list_id: LIST.S, contract_price_list_id: LIST.C, status: "Active" },
      { id: uuid("8", 2), company_id: CO, customer_id: CUST.B, default_price_list_id: LIST.S, contract_price_list_id: null, status: "Active" },
      { id: uuid("8", 3), company_id: CO, customer_id: CUST.C, default_price_list_id: null, contract_price_list_id: LIST.C, status: "Active" },
      { id: uuid("8", 6), company_id: CO, customer_id: CUST.F, default_price_list_id: LIST.S, contract_price_list_id: LIST.F, status: "Active" },
    ],
    vyron_customer_price_list_versions: [],
    vyron_customer_price_list_audit_log: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: [{ id: U_OWNER, email: "owner@qa.test", password: "qa-pass-owner" }], cookies: new Map(), headers: {} };
let db = createFakeSupabase(seed());
globalThis.__VYRON_SESSION_TEST__.supabase = db;
globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
const setCookieJar = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const priceRoute = await importFromRoot("src/app/api/customers/[id]/price/route.ts");
const { resolveCustomerProductPrice } = await importFromRoot("src/lib/vyron-customer-price-lists.ts");

setCookieJar({});
const loginRes = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: "owner@qa.test", password: "qa-pass-owner" }), headers: { "content-type": "application/json" } }));
const jar = Object.fromEntries(loginRes.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
check("synthetic owner signs in through the real login route", Boolean(jar.vyron_workspace_user_session));

async function setPrice(customerId, productId, price) {
  setCookieJar(jar);
  const res = await priceRoute.PATCH(
    new NextRequest(new URL(`/api/customers/${customerId}/price`, "http://qa.local"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, price }) }),
    { params: Promise.resolve({ id: customerId }) }
  );
  return { status: res.status, json: await res.json() };
}
const price = async (customer, product) => (await resolveCustomerProductPrice(db, CO, { customerId: customer, productId: product, asOfDate: "2026-11-02" })).sellingPrice;
async function snapshot() {
  const out = {};
  for (const [k, c] of Object.entries(CUST)) if (k !== "OTHER_CO") for (const [pk, p] of Object.entries(P)) out[`${k}.${pk}`] = await price(c, p);
  return out;
}
const sharedItems = () => JSON.stringify(db.tables.vyron_customer_price_list_items.filter((i) => [LIST.D, LIST.S, LIST.C].includes(i.price_list_id)).map((i) => [i.price_list_id, i.product_id, i.final_price, i.status]));
const listCount = () => db.tables.vyron_customer_price_lists.length;
const changedKeys = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

const before = await snapshot();
const sharedBefore = sharedItems();
check("baseline: A gets contract 80 for pie, B gets shared standard 90, C contract 80, E company default 100, F own 60",
  before["A.pie"] === 80 && before["B.pie"] === 90 && before["C.pie"] === 80 && before["E.pie"] === 100 && before["F.pie"] === 60, JSON.stringify(before));

console.log("\n1. Customer A (on a shared standard AND a shared contract list) changes the pie price");
{
  const r = await setPrice(CUST.A, P.pie, 75);
  const after = await snapshot();
  check("the route accepts it and creates A's own contract list", r.status === 200 && r.json?.createdOwnList === true, JSON.stringify(r.json));
  check("A now pays 75 for pie", after["A.pie"] === 75);
  check("NO other customer's price changed (B, C, E, F — every product)", JSON.stringify(changedKeys(before, after)) === JSON.stringify(["A.pie"]), JSON.stringify(changedKeys(before, after)));
  check("A's other prices are unchanged (tart from the copied contract 70, roll from the standard 180)", after["A.tart"] === 70 && after["A.roll"] === 180);
  check("the shared lists and the company default list were not written", sharedItems() === sharedBefore);
  const assignment = db.tables.vyron_customer_price_list_assignments.find((a) => a.customer_id === CUST.A);
  check("A keeps the shared standard list in the standard slot", assignment.default_price_list_id === LIST.S && assignment.contract_price_list_id === r.json.priceListId);
}

console.log("\n2. A second change for A reuses A's own list");
{
  const lists = listCount();
  const mid = await snapshot();
  const r = await setPrice(CUST.A, P.roll, 170);
  const after = await snapshot();
  check("no new list is created", r.status === 200 && r.json?.createdOwnList === false && listCount() === lists, JSON.stringify(r.json));
  check("only A's roll price changed (B still pays 180 on the shared standard list)", JSON.stringify(changedKeys(mid, after)) === JSON.stringify(["A.roll"]) && after["B.roll"] === 180 && after["A.roll"] === 170);
}

console.log("\n3. Customer B (shared standard list only) and customer E (no list: company default)");
{
  const mid = await snapshot();
  const rb = await setPrice(CUST.B, P.roll, 175);
  const re = await setPrice(CUST.E, P.roll, 150);
  const after = await snapshot();
  check("B and E each get their own list", rb.status === 200 && rb.json?.createdOwnList && re.status === 200 && re.json?.createdOwnList);
  check("exactly B.roll and E.roll changed — A, C and F untouched", JSON.stringify(changedKeys(mid, after).sort()) === JSON.stringify(["B.roll", "E.roll"]), JSON.stringify(changedKeys(mid, after)));
  check("E keeps the company default for its other products (pie 100, tart 300)", after["E.pie"] === 100 && after["E.tart"] === 300);
  check("the shared lists and the company default list are still unchanged", sharedItems() === sharedBefore);
}

console.log("\n4. Customer F already has its own (unshared) contract list");
{
  const lists = listCount();
  const mid = await snapshot();
  const r = await setPrice(CUST.F, P.pie, 65);
  const after = await snapshot();
  check("F's own list is updated in place, no new list", r.status === 200 && r.json?.createdOwnList === false && r.json?.priceListId === LIST.F && listCount() === lists);
  check("only F.pie changed", JSON.stringify(changedKeys(mid, after)) === JSON.stringify(["F.pie"]));
}

console.log("\n5. Refusals");
{
  const other = await setPrice(CUST.OTHER_CO, P.pie, 1);
  check("another company's customer is not found (404) and nothing is written", other.status === 404);
  const bad = await setPrice(CUST.A, P.pie, -5);
  check("a negative price is refused", bad.status === 400);
  const audit = db.tables.vyron_customer_price_list_audit_log.filter((a) => a.event_type === "Customer Price Changed");
  check("every customer-only change is audited with the customer", audit.length === 5 && audit.every((a) => a.metadata?.customerId));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
