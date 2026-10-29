#!/usr/bin/env node
/**
 * VOLORA — the last browser-side database writes now go through the server.
 *
 * DEFECTS THIS LOCKS DOWN (2026-10-29)
 * ------------------------------------
 * Five live screens wrote with the public key, from the browser:
 *   - Branch Manager: insert with a company id from the page; delete any branch by id.
 *   - Categories: insert/update/delete by id, any company.
 *   - Cost Calculator (+ line edit): recipe lines inserted/updated/deleted by id,
 *     with the ingredient's unit cost sent by the browser.
 *   - Recovery "Save calculated opportunities": company-less inserts into the
 *     legacy table (whose columns no longer match production).
 * Sixteen further browser editors and four writer functions were unreachable
 * from any page and were removed. Each live write is now a server route with a
 * permission, the member's own company, validated input, and an entry in the
 * company's audit register naming the member.
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data.
 *
 *   npm run test:master-data-server-writes
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10), U_SUP = uuid("a", 11), U_BUYER = uuid("a", 12), U_PROD = uuid("a", 13), U_ADMIN = uuid("a", 14);
const U_B_OWNER = uuid("b", 10);
const BR_A = uuid("c", 1), BR_B = uuid("c", 2);
const CAT_A = uuid("c", 11), CAT_A2 = uuid("c", 12), CAT_B = uuid("c", 13);
const REC_A = uuid("c", 21), REC_B = uuid("c", 22), ING_A = uuid("c", 31), ING_B = uuid("c", 32);
const LINE_A = uuid("c", 41), LINE_B = uuid("c", 42);
const SPOOF = "Someone Else (spoofed)";

const MEMBERS = [
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", "Synthetic", "Owner"],
  [U_ADMIN, "admin@qa-a.test", WS_A, "ADMIN", "Synthetic", "Admin"],
  [U_SUP, "sup@qa-a.test", WS_A, "SUPERVISOR", "Synthetic", "Supervisor"],
  [U_BUYER, "buyer@qa-a.test", WS_A, "PROCUREMENT", "Synthetic", "Buyer"],
  [U_PROD, "prod@qa-a.test", WS_A, "PRODUCTION", "Synthetic", "Operator"],
  [U_B_OWNER, "owner@qa-b.test", WS_B, "OWNER", "Tenant B", "Owner"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));

const XERO_MAPPING = { financial_sales_account_id: "200", financial_cost_of_sales_account_id: "310", financial_vat_tax_type: "OUTPUT2" };

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Full", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Full", status: "Setup" },
    ],
    vyron_workspace_memberships: MEMBERS.map(([userId, , ws, role], i) => ({ id: `m${i}`, workspace_id: ws, user_id: userId, role, status: "Active", permissions: {} })),
    vyron_user_profiles: MEMBERS.map(([id, email, , , first_name, surname]) => ({ id, email, first_name, surname })),
    vyron_branches: [
      { id: BR_A, company_id: CO_A, branch_name: "Main Kitchen", is_active: true },
      { id: BR_B, company_id: CO_B, branch_name: "Tenant B Branch", is_active: true },
    ],
    vyron_cost_categories: [
      { id: CAT_A, company_id: CO_A, category_name: "Pies", category_type: "Product", description: "Baked pies", status: "Active", ...XERO_MAPPING },
      { id: CAT_A2, company_id: CO_A, category_name: "Packaging", category_type: "Ingredient", description: null, status: "Active" },
      { id: CAT_B, company_id: CO_B, category_name: "Tenant B Category", category_type: "Product", status: "Active" },
    ],
    vyron_cost_recipes: [
      { id: REC_A, company_id: CO_A, recipe_name: "Pepper Steak Pie" },
      { id: REC_B, company_id: CO_B, recipe_name: "Tenant B Recipe" },
    ],
    vyron_cost_ingredients: [
      { id: ING_A, company_id: CO_A, ingredient_name: "Beef Mince", recipe_unit: "kg", true_unit_cost: 102.17, purchase_cost: 94 },
      { id: ING_B, company_id: CO_B, ingredient_name: "Tenant B Flour", recipe_unit: "kg", true_unit_cost: 9.5, purchase_cost: 9.5 },
    ],
    vyron_cost_recipe_items: [
      { id: LINE_A, company_id: CO_A, recipe_id: REC_A, ingredient_id: ING_A, ingredient_name_snapshot: "Beef Mince", quantity: 0.2, unit: "kg", true_unit_cost: 102.17 },
      { id: LINE_B, company_id: CO_B, recipe_id: REC_B, ingredient_id: ING_B, ingredient_name_snapshot: "Tenant B Flour", quantity: 1, unit: "kg", true_unit_cost: 9.5 },
    ],
    vyron_cost_audit_log: [],
    // Recovery engine inputs (empty: the recompute runs and finds nothing to calculate).
    vyron_supplier_price_history: [],
    vyron_cost_products: [],
    vyron_cost_suppliers: [],
    vyron_procurement_risk_alerts: [],
    vyron_cost_product_recipe_links: [],
    vyron_recovery_calculations: [],
    vyron_cost_recovery_opportunities: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function resetDb() {
  db = createFakeSupabase(seed(), { honourOrder: true });
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const rows = (table) => db.tables[table] || [];
const row = (table, id) => rows(table).find((r) => r.id === id);
const audits = () => rows("vyron_cost_audit_log");
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
const branches = await importFromRoot("src/app/api/branches/route.ts");
const branch = await importFromRoot("src/app/api/branches/[id]/route.ts");
const categories = await importFromRoot("src/app/api/categories/route.ts");
const category = await importFromRoot("src/app/api/categories/[id]/route.ts");
const lines = await importFromRoot("src/app/api/cost-calculator/lines/route.ts");
const lineRoute = await importFromRoot("src/app/api/cost-calculator/lines/[id]/route.ts");
const recompute = await importFromRoot("src/app/api/recovery/recompute/route.ts");

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
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = await quietly(() => (id === undefined ? handler(request) : handler(request, { params: Promise.resolve({ id }) })));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
const denied = (r) => r.status === 401 || r.status === 403;

resetDb();
const jar = {};
for (const [userId] of MEMBERS) jar[userId] = await login(userId);
check("every synthetic member signs in through the real login route", Object.values(jar).every((j) => Boolean(j.vyron_workspace_user_session)));

section("A1. Branches (admin.company)");
{
  resetDb();
  const r = await call(jar[U_OWNER], branches.POST, "/api/branches", { body: { branch_name: "  Durbanville Store  ", city: "Cape Town", company_id: CO_B, created_by: SPOOF } });
  const created = rows("vyron_branches").find((b) => b.branch_name === "Durbanville Store");
  check("owner creates a branch → 200, trimmed", r.status === 200 && Boolean(created), `${r.status} ${JSON.stringify(r.json)}`);
  check("the branch belongs to the member's company, not the company id the browser sent", created?.company_id === CO_A);
  check("the audit register names the member", audits().some((a) => a.company_id === CO_A && a.event_type === "Branch Created" && /by Synthetic Owner/.test(a.event_detail)));
  const sup = await call(jar[U_SUP], branches.POST, "/api/branches", { body: { branch_name: "Supervisor Branch" } });
  check("SUPERVISOR (admin.company by role) can create", sup.status === 200);
  const buyer = await call(jar[U_BUYER], branches.POST, "/api/branches", { body: { branch_name: "Buyer Branch" } });
  check("PROCUREMENT (no admin.company) → 403", buyer.status === 403 && !rows("vyron_branches").some((b) => b.branch_name === "Buyer Branch"));
  const anon = await call({}, branches.POST, "/api/branches", { body: { branch_name: "Anon Branch" } });
  check("signed out → 401/403", denied(anon));
  const noName = await call(jar[U_OWNER], branches.POST, "/api/branches", { body: { branch_name: "   " } });
  const longName = await call(jar[U_OWNER], branches.POST, "/api/branches", { body: { branch_name: "x".repeat(201) } });
  const badType = await call(jar[U_OWNER], branches.POST, "/api/branches", { body: { branch_name: "OK", city: 42 } });
  check("validation: blank name, too-long name, non-text field → 400", noName.status === 400 && longName.status === 400 && badType.status === 400);
  const crossDel = await call(jar[U_OWNER], branch.DELETE, `/api/branches/${BR_B}`, { method: "DELETE", id: BR_B });
  check("deleting tenant B's branch → 404, it remains", crossDel.status === 404 && Boolean(row("vyron_branches", BR_B)));
  const del = await call(jar[U_OWNER], branch.DELETE, `/api/branches/${BR_A}`, { method: "DELETE", id: BR_A });
  check("owner deletes their own branch → 200, audited", del.status === 200 && !row("vyron_branches", BR_A) && audits().some((a) => a.event_type === "Branch Deleted" && /Main Kitchen.*Synthetic Owner/.test(a.event_detail)));
}

section("A2. Categories (products.edit / products.delete)");
{
  resetDb();
  const r = await call(jar[U_OWNER], categories.POST, "/api/categories", { body: { category_name: "Frozen", category_type: "Product", description: "Frozen range", status: "Active", company_id: CO_B } });
  const created = rows("vyron_cost_categories").find((c) => c.category_name === "Frozen");
  check("owner creates a category in their own company", r.status === 200 && created?.company_id === CO_A, `${r.status} ${JSON.stringify(r.json)}`);
  const badType = await call(jar[U_OWNER], categories.POST, "/api/categories", { body: { category_name: "X", category_type: "Secret", status: "Active" } });
  const badStatus = await call(jar[U_OWNER], categories.POST, "/api/categories", { body: { category_name: "X", category_type: "Product", status: "Deleted" } });
  check("validation: unknown type or status → 400", badType.status === 400 && badStatus.status === 400);
  const upd = await call(jar[U_ADMIN], category.PATCH, `/api/categories/${CAT_A}`, { method: "PATCH", id: CAT_A, body: { category_name: "Pies & Pastries", category_type: "Product", description: "Baked", status: "Active", financial_sales_account_id: "999" } });
  const pies = row("vyron_cost_categories", CAT_A);
  check("ADMIN renames a category → 200", upd.status === 200 && pies?.category_name === "Pies & Pastries");
  check("its Xero account mapping is left exactly as it was (not settable here)", pies?.financial_sales_account_id === "200" && pies?.financial_cost_of_sales_account_id === "310" && pies?.financial_vat_tax_type === "OUTPUT2");
  check("the rename is audited with old and new name and the member", audits().some((a) => a.event_type === "Category Updated" && /"Pies" renamed to "Pies & Pastries" by Synthetic Admin/.test(a.event_detail)));
  const sup = await call(jar[U_SUP], category.PATCH, `/api/categories/${CAT_A2}`, { method: "PATCH", id: CAT_A2, body: { category_name: "Boxes", category_type: "Ingredient", status: "Active" } });
  check("SUPERVISOR (products view only) → 403", sup.status === 403 && row("vyron_cost_categories", CAT_A2).category_name === "Packaging");
  const cross = await call(jar[U_OWNER], category.PATCH, `/api/categories/${CAT_B}`, { method: "PATCH", id: CAT_B, body: { category_name: "Hijack", category_type: "Product", status: "Active" } });
  const crossDel = await call(jar[U_OWNER], category.DELETE, `/api/categories/${CAT_B}`, { method: "DELETE", id: CAT_B });
  check("tenant B's category cannot be changed or deleted (404)", cross.status === 404 && crossDel.status === 404 && row("vyron_cost_categories", CAT_B)?.category_name === "Tenant B Category");
  const anon = await call({}, category.DELETE, `/api/categories/${CAT_A2}`, { method: "DELETE", id: CAT_A2 });
  check("signed out → 401/403", denied(anon) && Boolean(row("vyron_cost_categories", CAT_A2)));
  const del = await call(jar[U_OWNER], category.DELETE, `/api/categories/${CAT_A2}`, { method: "DELETE", id: CAT_A2 });
  check("owner deletes their own category → 200, audited", del.status === 200 && !row("vyron_cost_categories", CAT_A2) && audits().some((a) => a.event_type === "Category Deleted"));
}

section("B. Cost Calculator lines (boms.edit) — the unit cost comes from the ingredient record");
{
  resetDb();
  const r = await call(jar[U_OWNER], lines.POST, "/api/cost-calculator/lines", {
    body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: 0.25, true_unit_cost: 0.01, ingredient_name_snapshot: "Cheap Beef", unit: "g", company_id: CO_B },
  });
  const added = rows("vyron_cost_recipe_items").find((l) => l.id !== LINE_A && l.recipe_id === REC_A);
  check("owner adds a line → 200", r.status === 200 && Boolean(added), `${r.status} ${JSON.stringify(r.json)}`);
  check("unit cost, name and unit are the ingredient's (102.17, Beef Mince, kg), not the browser's", added?.true_unit_cost === 102.17 && added?.ingredient_name_snapshot === "Beef Mince" && added?.unit === "kg");
  check("quantity kept exactly and the line is in the member's company", added?.quantity === 0.25 && added?.company_id === CO_A);
  check("the addition is audited with quantity, cost and the member", audits().some((a) => a.event_type === "Costing Line Added" && /0\.25 kg Beef Mince at 102\.17 .*Pepper Steak Pie.*Synthetic Owner/.test(a.event_detail)));
  const foreignIng = await call(jar[U_OWNER], lines.POST, "/api/cost-calculator/lines", { body: { recipe_id: REC_A, ingredient_id: ING_B, quantity: 1 } });
  const foreignRec = await call(jar[U_OWNER], lines.POST, "/api/cost-calculator/lines", { body: { recipe_id: REC_B, ingredient_id: ING_A, quantity: 1 } });
  check("another company's ingredient or recipe → 404", foreignIng.status === 404 && foreignRec.status === 404);
  const neg = await call(jar[U_OWNER], lines.POST, "/api/cost-calculator/lines", { body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: -1 } });
  const nan = await call(jar[U_OWNER], lines.POST, "/api/cost-calculator/lines", { body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: "lots" } });
  check("validation: negative or non-numeric quantity → 400", neg.status === 400 && nan.status === 400);
  const upd = await call(jar[U_OWNER], lineRoute.PATCH, `/api/cost-calculator/lines/${LINE_A}`, { method: "PATCH", id: LINE_A, body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: 0.3, true_unit_cost: 1 } });
  check("owner changes a line's quantity → 200, cost still from the ingredient", upd.status === 200 && row("vyron_cost_recipe_items", LINE_A)?.quantity === 0.3 && row("vyron_cost_recipe_items", LINE_A)?.true_unit_cost === 102.17);
  const sup = await call(jar[U_SUP], lineRoute.PATCH, `/api/cost-calculator/lines/${LINE_A}`, { method: "PATCH", id: LINE_A, body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: 9 } });
  const prod = await call(jar[U_PROD], lines.POST, "/api/cost-calculator/lines", { body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: 1 } });
  check("SUPERVISOR and PRODUCTION (BOMs view only) → 403", sup.status === 403 && prod.status === 403 && row("vyron_cost_recipe_items", LINE_A)?.quantity === 0.3);
  const crossUpd = await call(jar[U_OWNER], lineRoute.PATCH, `/api/cost-calculator/lines/${LINE_B}`, { method: "PATCH", id: LINE_B, body: { recipe_id: REC_A, ingredient_id: ING_A, quantity: 5 } });
  const crossDel = await call(jar[U_OWNER], lineRoute.DELETE, `/api/cost-calculator/lines/${LINE_B}`, { method: "DELETE", id: LINE_B });
  check("tenant B's line cannot be changed or deleted (404)", crossUpd.status === 404 && crossDel.status === 404 && row("vyron_cost_recipe_items", LINE_B)?.quantity === 1);
  const anon = await call({}, lineRoute.DELETE, `/api/cost-calculator/lines/${LINE_A}`, { method: "DELETE", id: LINE_A });
  check("signed out → 401/403", denied(anon) && Boolean(row("vyron_cost_recipe_items", LINE_A)));
  const del = await call(jar[U_OWNER], lineRoute.DELETE, `/api/cost-calculator/lines/${LINE_A}`, { method: "DELETE", id: LINE_A });
  check("owner removes a line → 200, audited", del.status === 200 && !row("vyron_cost_recipe_items", LINE_A) && audits().some((a) => a.event_type === "Costing Line Removed"));
  check("no audit entry or record carries a spoofed name", !JSON.stringify([rows("vyron_cost_audit_log"), rows("vyron_cost_recipe_items")]).includes(SPOOF));
}

section("C. Recovery recompute (recovery.manage)");
{
  resetDb();
  const r = await call(jar[U_OWNER], recompute.POST, "/api/recovery/recompute", {});
  check("owner recalculates → 200 with a count", r.status === 200 && typeof r.json?.count === "number", `${r.status} ${JSON.stringify(r.json)}`);
  check("no company-less legacy rows are inserted", rows("vyron_cost_recovery_opportunities").length === 0);
  check("the recalculation is audited for the member's company", audits().some((a) => a.company_id === CO_A && a.event_type === "Recovery Recalculated" && /Synthetic Owner/.test(a.event_detail)));
  const buyer = await call(jar[U_BUYER], recompute.POST, "/api/recovery/recompute", {});
  const anon = await call({}, recompute.POST, "/api/recovery/recompute", {});
  check("PROCUREMENT (no recovery.manage) → 403; signed out → 401/403", buyer.status === 403 && denied(anon));
}

section("D. No browser-side database write remains");
{
  const SRC = path.join(ROOT, "src");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  walk(SRC);
  // A module that imports the public-key client must never write through it.
  const PUBLIC_WRITE = /\bsupabase\s*\.\s*from\([^)]*\)\s*\.\s*(insert|update|upsert|delete)\(|\bsupabase\s*\n\s*\.from\([^)]*\)\s*\n\s*\.(insert|update|upsert|delete)\(|\bsupabase\s*\??\.\s*(rpc|storage)\b/;
  const offenders = files
    .filter((f) => /from\s+["']@\/lib\/supabase["']/.test(readFileSync(f, "utf8")))
    .filter((f) => PUBLIC_WRITE.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  check("no module writes, calls an RPC or uses storage through the public-key client", offenders.length === 0, offenders.join(", "));
  const SCREENS = ["BranchManagerClient", "CategoriesManager", "CostingEngineManager", "CostingLineEditPageClient", "RecoveryOpportunitiesClient"];
  const importing = SCREENS.filter((s) => /from\s+["']@\/lib\/supabase["']/.test(readFileSync(path.join(SRC, "components", `${s}.tsx`), "utf8")));
  check("the five migrated screens no longer import the public-key client", importing.length === 0, importing.join(", "));
  const REMOVED = ["IngredientRegisterClient", "IngredientsManager", "InvoiceAiManager", "ProductsManager", "PurchaseOrderBuilderClient", "PurchaseOrderListClient", "PurchaseOrdersClient", "PurchaseOrderFormClient", "RecipeBomBuilder", "RecipeEditPageClient", "RecipesManager", "SupplierInvoiceBuilderClient", "SupplierInvoiceListClient", "SupplierLinkedIngredientsClient", "SupplierRegisterClient", "SuppliersManager", "ProductBomPanelClient"];
  check("the 17 unreachable browser editors are gone", REMOVED.every((n) => !existsSync(path.join(SRC, "components", `${n}.tsx`))));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
