#!/usr/bin/env node
/**
 * VOLORA — Customer Price Management screen: the customer-first view must say exactly what the
 * pricing engine does.
 *
 * Proves the view-model behind the screen (src/lib/vyron-customer-pricing-view.ts):
 *   - tells a customer's own list apart from the company default (and both from the product master);
 *   - an inactive assignment, an inactive / out-of-date list and a missing list are explained;
 *   - per product it shows the price the REAL resolver (resolveCustomerProductPrice) charges today —
 *     checked for every customer × product in a synthetic company;
 *   - saving one slot (standard / contract) never clears the other; "none" returns the customer to
 *     the company default, through the REAL /api/customer-price-lists route, audited;
 *   - customer search and active/inactive status.
 * Family A: no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:customer-pricing-view
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
const section = (t) => console.log(`\n${t}`);

const view = await importFromRoot("src/lib/vyron-customer-pricing-view.ts");
const prices = await importFromRoot("src/lib/vyron-customer-price-lists.ts");
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");

const TODAY = "2026-10-07";
const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO = uuid("a", 1);
const WS = uuid("a", 2);
const L = { hfp: uuid("1", 1), wholesale: uuid("1", 2), contractAbc: uuid("1", 3), oldList: uuid("1", 4), future: uuid("1", 5) };
const C = { abc: uuid("c", 1), walkin: uuid("c", 2), deli: uuid("c", 3), lapsed: uuid("c", 4), closed: uuid("c", 5), futureCust: uuid("c", 6) };
const P = { curry: uuid("e", 1), stew: uuid("e", 2), pie: uuid("e", 3), soup: uuid("e", 4) };

const lists = [
  { id: L.hfp, company_id: CO, list_name: "HFP 2026/2027", list_type: "Standard", status: "Active", version: 1, effective_from: "2026-03-01", effective_to: null, is_company_default: true },
  { id: L.wholesale, company_id: CO, list_name: "Wholesale", list_type: "Standard", status: "Active", version: 2, effective_from: null, effective_to: null, is_company_default: false },
  { id: L.contractAbc, company_id: CO, list_name: "ABC Contract", list_type: "Contract", status: "Active", version: 1, effective_from: null, effective_to: null, is_company_default: false },
  { id: L.oldList, company_id: CO, list_name: "Old 2024", list_type: "Standard", status: "Inactive", version: 1, effective_from: null, effective_to: null, is_company_default: false },
  { id: L.future, company_id: CO, list_name: "Next Year", list_type: "Standard", status: "Active", version: 1, effective_from: "2027-03-01", effective_to: null, is_company_default: false },
];
let n = 0;
const item = (list, product, price, extra = {}) => ({ id: uuid("f", ++n), company_id: CO, price_list_id: list, product_id: product, base_price: price, markup_pct: 0, discount_pct: 0, gp_pct: 0, override_price: null, final_price: price, status: "Active", effective_from: null, effective_to: null, updated_at: "2026-10-01T00:00:00Z", ...extra });
const items = [
  item(L.hfp, P.curry, 49.9),
  item(L.hfp, P.stew, 45),
  item(L.hfp, P.pie, 30, { effective_to: "2026-09-30" }), // expired on the default list
  item(L.wholesale, P.curry, 42.5),
  item(L.wholesale, P.stew, 40),
  item(L.wholesale, P.soup, 25, { status: "Inactive" }),
  item(L.contractAbc, P.curry, 39.9),
  item(L.contractAbc, P.stew, 38, { effective_from: "2026-11-01" }), // scheduled: wholesale applies today
  item(L.oldList, P.curry, 10),
  item(L.future, P.curry, 55),
];
const assignments = [
  { id: uuid("d", 1), company_id: CO, customer_id: C.abc, default_price_list_id: L.wholesale, contract_price_list_id: L.contractAbc, status: "Active" },
  { id: uuid("d", 2), company_id: CO, customer_id: C.deli, default_price_list_id: L.hfp, contract_price_list_id: null, status: "Active" },
  { id: uuid("d", 3), company_id: CO, customer_id: C.lapsed, default_price_list_id: L.wholesale, contract_price_list_id: null, status: "Inactive" },
  { id: uuid("d", 4), company_id: CO, customer_id: C.closed, default_price_list_id: L.oldList, contract_price_list_id: null, status: "Active" },
  { id: uuid("d", 5), company_id: CO, customer_id: C.futureCust, default_price_list_id: L.future, contract_price_list_id: null, status: "Active" },
];
const customers = [
  { id: C.abc, company_id: CO, customer_name: "ABC Retail", customer_code: "ABC01", active: true, status: "Active" },
  { id: C.walkin, company_id: CO, customer_name: "Walk-in Deli", customer_code: "WALK", active: true, status: null },
  { id: C.deli, company_id: CO, customer_name: "Corner Deli", customer_code: "CD", active: true, status: "Active" },
  { id: C.lapsed, company_id: CO, customer_name: "Lapsed Foods", customer_code: "LF", active: false, status: "Inactive" },
  { id: C.closed, company_id: CO, customer_name: "Closed Account Store", customer_code: "CAS", active: true, status: "Active" },
  { id: C.futureCust, company_id: CO, customer_name: "Future Pricing Co", customer_code: "FPC", active: true, status: "Active" },
];
const products = [
  { id: P.curry, company_id: CO, product_name: "Thai Green Curry", sku: "TGC", selling_price: 60, total_cost: 13 },
  { id: P.stew, company_id: CO, product_name: "Chilli Beef Stew", sku: "CBS", selling_price: 58, total_cost: 11 },
  { id: P.pie, company_id: CO, product_name: "Chicken Pie", sku: "PIE", selling_price: 35, total_cost: 9 },
  { id: P.soup, company_id: CO, product_name: "Butternut Soup", sku: "SOUP", selling_price: 28, total_cost: 6 },
];
const seed = () => ({
  vyron_workspaces: [{ id: WS, company_id: CO, company_name: "Synthetic Foods", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 }],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS, user_id: uuid("a", 10), role: "SALES", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS, user_id: uuid("a", 11), role: "VIEW_ONLY", status: "Active", permissions: {} },
  ],
  vyron_customer_price_lists: lists.map((l) => ({ ...l })),
  vyron_customer_price_list_items: items.map((i) => ({ ...i })),
  vyron_customer_price_list_assignments: assignments.map((a) => ({ ...a })),
  vyron_customer_price_list_audit_log: [],
  vyron_customers: customers.map((c) => ({ ...c })),
  vyron_cost_products: products.map((p) => ({ ...p })),
});
const viewLists = lists.map(({ company_id, ...l }) => l);
const summaryFor = (customerId, data = { assignments, lists: viewLists }) => view.customerPricingSummary({ customerId, assignments: data.assignments, lists: data.lists, today: TODAY });

// ---------------------------------------------------------------------------
section("1. Where the customer's prices come from");
{
  const abc = summaryFor(C.abc);
  check("own lists: contract first, then the standard list", abc.source === "assigned" && abc.governingLists.map((l) => l.list_name).join(" > ") === "ABC Contract > Wholesale" && abc.warnings.length === 0);
  const walk = summaryFor(C.walkin);
  check("no assignment → company default (named), not an assignment", walk.source === "company_default" && walk.companyDefault.list_name === "HFP 2026/2027" && walk.assignment === null);
  const deli = summaryFor(C.deli);
  check("explicitly assigned the list that is also the company default → still an assignment", deli.source === "assigned" && deli.standardList.id === L.hfp && deli.assignment !== null);
  const lapsed = summaryFor(C.lapsed);
  check("inactive assignment → company default, and the screen says the assignment is inactive", lapsed.source === "company_default" && lapsed.assignmentInactive === true);
  const closed = summaryFor(C.closed);
  check("assigned list inactive → explained; the customer is NOT shown as on the company default", closed.source === "assigned" && closed.warnings.some((w) => /Old 2024 is inactive/.test(w)));
  const future = summaryFor(C.futureCust);
  check("assigned list not yet in effect → explained", future.warnings.some((w) => /only takes effect on 2027-03-01/.test(w)));
  const noDefault = summaryFor(C.walkin, { assignments, lists: viewLists.map((l) => ({ ...l, is_company_default: false })) });
  check("no assignment and no company default → product master", noDefault.source === "product_master" && noDefault.governingLists.length === 0);
  const twoDefaults = summaryFor(C.walkin, { assignments, lists: viewLists.map((l) => ({ ...l, is_company_default: l.id === L.hfp || l.id === L.wholesale })) });
  check("two company defaults → flagged, none chosen", twoDefaults.companyDefault === null && twoDefaults.warnings.some((w) => /More than one company default/.test(w)));
  const missing = summaryFor(C.abc, { assignments, lists: viewLists.filter((l) => l.id !== L.contractAbc) });
  check("an assigned list that no longer exists → flagged", missing.warnings.some((w) => /no longer exists/.test(w)));
}

// ---------------------------------------------------------------------------
section("2. The price shown is the price charged (view vs the real resolver)");
{
  const db = createFakeSupabase(seed(), { honourOrder: true });
  let compared = 0;
  const mismatches = [];
  for (const c of customers) {
    const s = summaryFor(c.id);
    const details = await Promise.all(s.governingLists.map((l) => prices.getCustomerPriceListDetail(db, CO, l.id)));
    const rows = view.customerPriceRows({ lists: details.map((d) => ({ list: { ...d.list, is_company_default: d.list.is_company_default }, items: d.items })), contractListId: s.contractList?.id || null, today: TODAY });
    for (const p of products) {
      const resolved = await prices.resolveCustomerProductPrice(db, CO, { customerId: c.id, productId: p.id, asOfDate: TODAY });
      const row = rows.find((r) => r.productId === p.id);
      const inForce = row && row.state === "Active";
      compared++;
      const listPriced = ["contract", "default", "company_default"].includes(resolved.source);
      const agrees = listPriced ? inForce && row.price === resolved.sellingPrice && row.listId === resolved.priceListId : !inForce;
      if (!agrees) mismatches.push(`${c.customer_name} / ${p.product_name}: view ${row ? `${row.state} ${row.price} ${row.listName}` : "none"} vs resolver ${resolved.source} ${resolved.sellingPrice}`);
    }
  }
  check(`every customer × product agrees with resolveCustomerProductPrice (${compared} pairs)`, mismatches.length === 0, mismatches.join("\n       "));

  const s = summaryFor(C.abc);
  const details = await Promise.all(s.governingLists.map((l) => prices.getCustomerPriceListDetail(db, CO, l.id)));
  const rows = view.customerPriceRows({ lists: details.map((d) => ({ list: d.list, items: d.items })), contractListId: L.contractAbc, today: TODAY });
  const curry = rows.find((r) => r.productId === P.curry);
  const stew = rows.find((r) => r.productId === P.stew);
  check("contract price wins and names what it overrides", curry.price === 39.9 && curry.listName === "ABC Contract" && curry.overrides?.listName === "Wholesale" && curry.overrides.price === 42.5);
  check("contract price not yet in effect → the standard list's price applies today", stew.price === 40 && stew.listName === "Wholesale" && stew.state === "Active");
  check("a removed product stays visible as Removed (not hidden)", rows.find((r) => r.productId === P.soup)?.state === "Removed");
  const walk = summaryFor(C.walkin);
  const walkRows = view.customerPriceRows({ lists: [{ list: (await prices.getCustomerPriceListDetail(db, CO, L.hfp)).list, items: (await prices.getCustomerPriceListDetail(db, CO, L.hfp)).items }], contractListId: null, today: TODAY });
  check("company-default customer sees the default list's prices; expired items marked Expired", walk.source === "company_default" && walkRows.find((r) => r.productId === P.curry).price === 49.9 && walkRows.find((r) => r.productId === P.pie).state === "Expired");
  const closedRows = view.customerPriceRows({ lists: [{ list: viewLists.find((l) => l.id === L.oldList), items: (await prices.getCustomerPriceListDetail(db, CO, L.oldList)).items }], contractListId: null, today: TODAY });
  check("items on an inactive list are 'List not in use'", closedRows.every((r) => r.state === "List not in use"));
  check("rows in force first, then scheduled / not in use / expired / removed", rows.map((r) => r.state).join(",") === rows.map((r) => r.state).sort((a, b) => ["Active", "Scheduled", "List not in use", "Expired", "Removed"].indexOf(a) - ["Active", "Scheduled", "List not in use", "Expired", "Removed"].indexOf(b)).join(","));
}

// ---------------------------------------------------------------------------
section("3. Saving an assignment never clears the other slot");
{
  const abc = assignments.find((a) => a.customer_id === C.abc);
  const changeStandard = view.assignmentRequest({ customerId: C.abc, current: abc, standardListId: L.hfp });
  check("changing the standard list keeps the contract list", changeStandard.defaultPriceListId === L.hfp && changeStandard.contractPriceListId === L.contractAbc);
  const changeContract = view.assignmentRequest({ customerId: C.abc, current: abc, contractListId: null });
  check("removing the contract list keeps the standard list", changeContract.defaultPriceListId === L.wholesale && changeContract.contractPriceListId === null);
  const clear = view.assignmentRequest({ customerId: C.abc, current: abc, standardListId: null, contractListId: null });
  check("'none' for both clears the customer's lists", clear.defaultPriceListId === null && clear.contractPriceListId === null && clear.mode === "assign");
  const fromInactive = view.assignmentRequest({ customerId: C.lapsed, current: assignments.find((a) => a.customer_id === C.lapsed), contractListId: L.contractAbc });
  check("an inactive assignment's old list is not silently revived", fromInactive.defaultPriceListId === null && fromInactive.contractPriceListId === L.contractAbc);
}

// ---------------------------------------------------------------------------
section("4. Through the real route: assign, return to the company default, audit, permissions");
{
  const db = createFakeSupabase(seed(), { honourOrder: true });
  globalThis.__VYRON_SESSION_TEST__ = {
    supabase: db,
    browserSupabase: db,
    users: [
      { id: uuid("a", 10), email: "sales@qa.test", password: "qa-pass-sales" },
      { id: uuid("a", 11), email: "viewer@qa.test", password: "qa-pass-viewer" },
    ],
    cookies: new Map(),
    headers: {},
  };
  const { NextRequest } = await import("next/server");
  const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
  const route = await importFromRoot("src/app/api/customer-price-lists/route.ts");
  const setJar = (jar) => (globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})));
  const login = async (email, password) => {
    setJar({});
    const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
    return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  };
  const call = async (jar, method, body) => {
    setJar(jar);
    const res = await route[method](new NextRequest(new URL("/api/customer-price-lists", "http://qa.local"), { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const sales = await login("sales@qa.test", "qa-pass-sales");
  const viewer = await login("viewer@qa.test", "qa-pass-viewer");

  const loaded = await call(sales, "GET");
  check("the screen's data loads (lists with company default flag, assignments)", loaded.status === 200 && loaded.json.lists.some((l) => l.is_company_default) && loaded.json.assignments.length === 5);
  const abc = loaded.json.assignments.find((a) => a.customer_id === C.abc);
  const r1 = await call(sales, "POST", view.assignmentRequest({ customerId: C.abc, current: abc, standardListId: L.hfp }));
  const row1 = db.tables.vyron_customer_price_list_assignments.find((a) => a.customer_id === C.abc);
  check("change ABC's standard list → saved, contract list kept", r1.status === 200 && row1.default_price_list_id === L.hfp && row1.contract_price_list_id === L.contractAbc);
  const r2 = await call(sales, "POST", view.assignmentRequest({ customerId: C.abc, current: row1, standardListId: null, contractListId: null }));
  const row2 = db.tables.vyron_customer_price_list_assignments.find((a) => a.customer_id === C.abc);
  const resolved = await prices.resolveCustomerProductPrice(db, CO, { customerId: C.abc, productId: P.curry, asOfDate: TODAY });
  check("clear both → ABC is priced from the company default (HFP R49.90)", r2.status === 200 && !row2.default_price_list_id && !row2.contract_price_list_id && resolved.source === "company_default" && resolved.sellingPrice === 49.9);
  check("both changes are in the audit log", db.tables.vyron_customer_price_list_audit_log.filter((a) => a.event_type === "Customer Price List Assignment Updated").length === 2);
  const denied = await call(viewer, "POST", view.assignmentRequest({ customerId: C.abc, current: row2, standardListId: L.wholesale }));
  check("a view-only member cannot change an assignment", denied.status === 403 && !db.tables.vyron_customer_price_list_assignments.find((a) => a.customer_id === C.abc).default_price_list_id);
}

// ---------------------------------------------------------------------------
section("5. Customer search and status");
{
  const names = (q) => view.searchCustomers(customers, q).map((c) => c.customer_name);
  check("search by the start of a name", names("abc")[0] === "ABC Retail");
  check("search by a word inside the name", names("deli").includes("Walk-in Deli") && names("deli").includes("Corner Deli"));
  check("search by customer code", names("FPC")[0] === "Future Pricing Co");
  check("no match → nothing", names("zzz").length === 0);
  check("active / inactive from the customer record", view.customerIsActive(customers[0]) && !view.customerIsActive(customers.find((c) => c.id === C.lapsed)) && view.customerIsActive({ active: true, status: null }));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
