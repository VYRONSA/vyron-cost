#!/usr/bin/env node
/**
 * VOLORA — supervisor authority is the signed-in member's permission, never a
 * shared PIN or a flag the browser sets.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (Kingdom Foods, 2026-10-29)
 * -------------------------------------------------------------
 * Chantelle White, the active OWNER of Handcrafted Food Products, was blocked
 * by a "Supervisor PIN" prompt. The PIN was VYRON_DOCUMENT_SUPERVISOR_PIN: one
 * secret shared by every tenant, which no owner had been given and which
 * recorded nothing about who used it. Every supervisor gate was audited:
 *
 *   1. Invoice approval policy override   (PIN)   -> supplier_invoices.override
 *      covered by npm run test:supervisor-override
 *   2. Archived invoice cost rollback     (PIN only, no permission at all)
 *                                                 -> supplier_invoices.rollback_cost
 *   3. Production run reversal ("Supervisor mode": a browser-sent
 *      `supervisor: true` and `actor: "supervisor"`)
 *                                                 -> manufacturing.runs.reverse, actor from session
 *   4. Production completion with a stock override (permission + reason; no PIN)
 *                                                 -> unchanged, regression-checked here
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data.
 *
 *   npm run test:supervisor-permission-gates
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";
// A deployment may still carry the old variable. It must grant nothing.
const LEFTOVER_PIN = `qa-pin-${randomBytes(4).toString("hex")}`;
process.env.VYRON_DOCUMENT_SUPERVISOR_PIN = LEFTOVER_PIN;

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
const round2 = (n) => Math.round(n * 100) / 100;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10), U_CLERK = uuid("a", 11), U_SUP = uuid("a", 12), U_SUP_REVOKED = uuid("a", 13);
const U_PRODUCTION = uuid("a", 14), U_VIEW = uuid("a", 15), U_B_OWNER = uuid("b", 10);
const DOC_A = uuid("d", 1), DOC_B = uuid("d", 2);

const MEMBERS = [
  // [userId, email, workspace, role, saved permissions, first name, surname]
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", {}, "Synthetic", "Owner"],
  [U_CLERK, "clerk@qa-a.test", WS_A, "PROCUREMENT", {}, "Synthetic", "Clerk"],
  [U_SUP, "sup@qa-a.test", WS_A, "SUPERVISOR", {}, "Synthetic", "Supervisor"],
  [U_SUP_REVOKED, "sup-revoked@qa-a.test", WS_A, "SUPERVISOR", { "supplier_invoices.rollback_cost": false, "manufacturing.runs.complete": false }, "Revoked", "Supervisor"],
  [U_PRODUCTION, "production@qa-a.test", WS_A, "PRODUCTION", {}, "Synthetic", "Operator"],
  [U_VIEW, "view@qa-a.test", WS_A, "VIEW_ONLY", {}, "Synthetic", "Viewer"],
  [U_B_OWNER, "owner@qa-b.test", WS_B, "OWNER", {}, "Tenant B", "Owner"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));

/** A production run the way the production screen creates it. */
function productionRun(id, company, productId, qty, materialPerUnit, extra = {}) {
  const ingredient = round2(qty * materialPerUnit);
  return {
    run: {
      id, company_id: company, run_number: `PR-${id}`, bom_id: null, recipe_id: null, product_id: productId,
      bom_name_snapshot: "Synthetic Pie", product_name_snapshot: "Synthetic Pie", status: "Approved",
      batch_multiplier: qty, planned_qty: qty, actual_qty: 0, planned_cost: round2(ingredient + 290), planned_usage_value: ingredient,
      ingredient_cost: ingredient, packaging_cost: 0, labour_cost: 170, overhead_cost: 120, stock_override: false,
      created_at: "2026-10-13T07:41:00Z", ...extra,
    },
    line: { id: `${id}-l1`, company_id: company, production_run_id: id, line_type: "Ingredient", ingredient_id: "ing-filling",
      stock_item_id: company === CO_A ? "si-filling" : "si-filling-b", line_name: "Pie filling", unit: "kg",
      planned_qty: qty, actual_qty: qty, unit_cost: materialPerUnit, planned_value: ingredient, actual_value: ingredient, sort_order: 0 },
    labour: { id: `${id}-lab`, company_id: company, production_run_id: id, description: "Direct Labour", hours: 2, rate: 85, labour_cost: 170 },
    overhead: { id: `${id}-oh`, company_id: company, production_run_id: id, overhead_type: "Factory Overheads", allocation_method: "Per Run", amount: 120, percent_value: null, allocated_cost: 120 },
  };
}
const RUNS = [
  productionRun("r-batch", CO_A, "p-pie", 100, 5),
  productionRun("r-short", CO_A, "p-pie", 2000, 5), // needs 2,000 kg of filling against 1,000 on hand
  productionRun("r-done", CO_A, "p-pie", 10, 5, { status: "Completed", actual_qty: 10, completed_at: "2026-10-20T10:00:00Z" }),
  productionRun("r-b", CO_B, "p-b", 10, 5, { status: "Completed", actual_qty: 10, completed_at: "2026-10-20T10:00:00Z" }),
];

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    ],
    vyron_workspace_memberships: MEMBERS.map(([userId, , ws, role, permissions], i) => ({ id: `m${i}`, workspace_id: ws, user_id: userId, role, status: "Active", permissions })),
    vyron_user_profiles: MEMBERS.map(([id, email, , , , first_name, surname]) => ({ id, email, first_name, surname })),
    // Archived invoices whose approval moved two ingredient costs.
    vyron_documents: [
      { id: DOC_A, tenant_id: CO_A, status: "archived", supplier_name: "QA Meat Supplier", invoice_number: "INV-QA-1", approved_at: "2026-10-01T08:00:00Z" },
      { id: DOC_B, tenant_id: CO_B, status: "archived", supplier_name: "QA B Supplier", invoice_number: "INV-QB-1", approved_at: "2026-10-01T08:00:00Z" },
    ],
    vyron_document_cost_audit: [
      { id: "ca1", tenant_id: CO_A, document_id: DOC_A, entity_type: "ingredient", entity_id: "ing-1", entity_name: "Beef mince", previous_cost: 140, new_cost: 150, currency: "ZAR", rolled_back_at: null, created_at: "2026-10-01T08:00:00Z" },
      { id: "ca2", tenant_id: CO_A, document_id: DOC_A, entity_type: "ingredient", entity_id: "ing-2", entity_name: "Chicken fillet", previous_cost: 190, new_cost: 200, currency: "ZAR", rolled_back_at: null, created_at: "2026-10-01T08:00:01Z" },
      { id: "cb1", tenant_id: CO_B, document_id: DOC_B, entity_type: "ingredient", entity_id: "ing-b", entity_name: "B item", previous_cost: 10, new_cost: 12, currency: "ZAR", rolled_back_at: null, created_at: "2026-10-01T08:00:00Z" },
    ],
    vyron_document_cost_rollback_audit: [],
    vyron_cost_ingredients: [
      { id: "ing-1", company_id: CO_A, ingredient_name: "Beef mince", purchase_cost: 150, true_unit_cost: 150 },
      { id: "ing-2", company_id: CO_A, ingredient_name: "Chicken fillet", purchase_cost: 200, true_unit_cost: 200 },
      { id: "ing-b", company_id: CO_B, ingredient_name: "B item", purchase_cost: 12, true_unit_cost: 12 },
    ],
    vyron_cost_products: [
      { id: "p-pie", company_id: CO_A, product_name: "Synthetic Pie", selling_price: 12, total_cost: 5 },
      { id: "p-b", company_id: CO_B, product_name: "Tenant B Pie", selling_price: 12, total_cost: 5 },
    ],
    vyron_cost_stock_items: [
      { id: "si-filling", company_id: CO_A, entity_type: "ingredient", entity_id: "ing-filling", description: "Pie filling", unit: "kg", qty_on_hand: 1000, average_cost: 5, current_cost: 5, inventory_value: 5000 },
      { id: "si-filling-b", company_id: CO_B, entity_type: "ingredient", entity_id: "ing-filling", description: "Pie filling", unit: "kg", qty_on_hand: 100, average_cost: 5, current_cost: 5, inventory_value: 500 },
      { id: "si-fg-pie", company_id: CO_A, entity_type: "finished_goods", entity_id: "p-pie", description: "Synthetic Pie", unit: "unit", qty_on_hand: 0, average_cost: 0, current_cost: 0, inventory_value: 0 },
      { id: "si-fg-b", company_id: CO_B, entity_type: "finished_goods", entity_id: "p-b", description: "Tenant B Pie", unit: "unit", qty_on_hand: 0, average_cost: 0, current_cost: 0, inventory_value: 0 },
    ],
    vyron_cost_stock_ledger: [],
    vyron_cost_inventory_transactions: [],
    vyron_inventory_audit_log: [],
    vyron_stock_minimum_levels: [],
    vyron_cost_production_runs: RUNS.map((r) => r.run),
    vyron_cost_production_run_lines: RUNS.map((r) => r.line),
    vyron_cost_production_labour: RUNS.map((r) => r.labour),
    vyron_cost_production_overhead: RUNS.map((r) => r.overhead),
    vyron_cost_production_wastage: [],
    vyron_cost_production_audit_log: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
let rpcCalls = [];
function resetDb() {
  db = createFakeSupabase(seed(), { honourOrder: true });
  rpcCalls = [];
  // reverse_production_run is one PostgreSQL transaction (covered by test:manufacture-reversal-pg).
  // Here only the authorisation in front of it is under test, so record what reaches it.
  db.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: { status: "reversed" }, error: null };
  };
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const rows = (table) => db.tables[table] || [];
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
const rollbackRoute = await importFromRoot("src/app/api/documents/[id]/rollback-cost/route.ts");
const reverseRoute = await importFromRoot("src/app/api/production/runs/[id]/reverse/route.ts");
const completeRoute = await importFromRoot("src/app/api/production/runs/[id]/complete/route.ts");
const permissions = await importFromRoot("src/lib/vyron-workspace-permissions.ts");

async function login(userId) {
  const user = USERS.find((u) => u.id === userId);
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: user.email, password: user.password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

async function call(jar, handler, url, id, body) {
  setCookieJar(jar);
  const request = new NextRequest(new URL(url, "http://qa.local"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const res = await quietly(() => handler(request, { params: Promise.resolve({ id }) }));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
const rollback = (jar, doc, body) => call(jar, rollbackRoute.POST, `/api/documents/${doc}/rollback-cost`, doc, body);
const reverse = (jar, run, body) => call(jar, reverseRoute.POST, `/api/production/runs/${run}/reverse`, run, body);
const complete = (jar, run, body) => call(jar, completeRoute.POST, `/api/production/runs/${run}/complete`, run, body);
const denied = (r) => r.status === 401 || r.status === 403;

resetDb();
const jar = {};
for (const [userId] of MEMBERS) jar[userId] = await login(userId);
check("every synthetic member signs in through the real login route", MEMBERS.every(([userId]) => Boolean(jar[userId].vyron_workspace_user_session)));

section("1. Role matrix: who holds supervisor authority");
const roleHas = (role, key) => permissions.hasPermission(role, key, {});
for (const key of ["supplier_invoices.override", "supplier_invoices.rollback_cost"]) {
  check(`${key}: OWNER, ADMIN and SUPERVISOR hold it by default`, ["OWNER", "ADMIN", "SUPERVISOR"].every((role) => roleHas(role, key)));
  check(`${key}: PROCUREMENT, PRODUCTION, INVENTORY, SALES and VIEW_ONLY do not`, ["PROCUREMENT", "PRODUCTION", "INVENTORY", "SALES", "VIEW_ONLY"].every((role) => !roleHas(role, key)));
  check(`${key}: an owner cannot be locked out by a saved map`, permissions.hasPermission("OWNER", key, { [key]: false }));
  check(`${key}: a supervisor can have it switched off`, !permissions.hasPermission("SUPERVISOR", key, { [key]: false }));
  check(`${key}: listed in User Setup's permission groups`, permissions.ALL_PERMISSION_KEYS.includes(key));
}
check("manufacturing.runs.reverse stays OWNER/ADMIN only (unchanged)", roleHas("OWNER", "manufacturing.runs.reverse") && roleHas("ADMIN", "manufacturing.runs.reverse") && !roleHas("SUPERVISOR", "manufacturing.runs.reverse") && !roleHas("PRODUCTION", "manufacturing.runs.reverse"));

section("2. Archived invoice cost rollback: the owner, without a PIN");
{
  resetDb();
  const noReason = await rollback(jar[U_OWNER], DOC_A, { notes: "   " });
  check("owner, blank reason → 400, nothing rolled back", noReason.status === 400 && /reason is required/.test(noReason.json?.error || "") && rows("vyron_document_cost_rollback_audit").length === 0);
  const r = await rollback(jar[U_OWNER], DOC_A, { notes: "Supplier issued a credit note for the price increase", rolledBackBy: "someone-else" });
  check("owner + reason, no PIN → 200, two cost updates reversed", r.status === 200 && r.json?.ok === true && r.json?.reversed === 2, JSON.stringify(r.json));
  const ing = (id) => rows("vyron_cost_ingredients").find((i) => i.id === id);
  check("ingredient costs restored (R150→R140, R200→R190)", ing("ing-1").purchase_cost === 140 && ing("ing-2").purchase_cost === 190);
  const audit = rows("vyron_document_cost_rollback_audit")[0] || {};
  check("rollback audit names the verified member, not the browser's label", audit.rolled_back_by === "Synthetic Owner", String(audit.rolled_back_by));
  check("rollback audit records the reason", audit.approval_notes === "Supplier issued a credit note for the price increase");
  check("rollback audit records the authorising user, role and permission", audit.metadata?.authorisation?.userId === U_OWNER && audit.metadata?.authorisation?.role === "OWNER" && audit.metadata?.authorisation?.permission === "supplier_invoices.rollback_cost");
  check("tenant B's invoice cost is untouched", rows("vyron_cost_ingredients").find((i) => i.id === "ing-b").purchase_cost === 12);
}

section("3. Cost rollback: who is refused");
{
  resetDb();
  const reason = { notes: "reason" };
  const clerk = await rollback(jar[U_CLERK], DOC_A, reason);
  check("PROCUREMENT clerk → 403", clerk.status === 403, String(clerk.status));
  const clerkPin = await rollback(jar[U_CLERK], DOC_A, { ...reason, supervisorPin: LEFTOVER_PIN });
  const clerkDefault = await rollback(jar[U_CLERK], DOC_A, { ...reason, supervisorPin: "vyron-supervisor" });
  check("the old env PIN and the old built-in default grant a clerk nothing", clerkPin.status === 403 && clerkDefault.status === 403);
  const view = await rollback(jar[U_VIEW], DOC_A, reason);
  check("VIEW_ONLY → 403", view.status === 403);
  const revoked = await rollback(jar[U_SUP_REVOKED], DOC_A, reason);
  check("a SUPERVISOR with rollback switched off → 403", revoked.status === 403);
  const anon = await rollback({}, DOC_A, { ...reason, supervisorPin: LEFTOVER_PIN });
  check("no session, even with the old PIN → 401/403", denied(anon), String(anon.status));
  const crossTenant = await rollback(jar[U_B_OWNER], DOC_A, reason);
  check("tenant B's OWNER on tenant A's invoice → 403", crossTenant.status === 403, String(crossTenant.status));
  check("nothing was rolled back by any refused caller", rows("vyron_document_cost_rollback_audit").length === 0 && rows("vyron_cost_ingredients").find((i) => i.id === "ing-1").purchase_cost === 150);
  check("no refusal echoes a PIN", ![clerk, clerkPin, clerkDefault, view, revoked, anon, crossTenant].some((x) => JSON.stringify(x.json).includes(LEFTOVER_PIN) || JSON.stringify(x.json).includes("vyron-supervisor")));
  const sup = await rollback(jar[U_SUP], DOC_A, { notes: "Duplicate invoice approved twice" });
  check("a SUPERVISOR-role member rolls back by role default → 200", sup.status === 200 && rows("vyron_document_cost_rollback_audit")[0]?.rolled_back_by === "Synthetic Supervisor");
}

section("4. Production run reversal: authority from the session, not the browser");
{
  resetDb();
  const noReason = await reverse(jar[U_OWNER], "r-done", { reason: "  " });
  check("owner, blank reason → 400, nothing reversed", noReason.status === 400 && rpcCalls.length === 0);
  const r = await reverse(jar[U_OWNER], "r-done", { reason: "Incorrect batch quantity captured", supervisor: false, actor: "someone-else" });
  check("owner + reason, no supervisor flag, no PIN → 200", r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 300));
  const rpc = rpcCalls[0]?.args || {};
  check("the reversal runs for the session's company and run", rpcCalls.length === 1 && rpc.p_company_id === CO_A && rpc.p_run_id === "r-done");
  check("the audit actor is the verified member, not the browser's 'actor'", rpc.p_actor === "Synthetic Owner", String(rpc.p_actor));
  check("the reason is passed through to the audited transaction", rpc.p_reason === "Incorrect batch quantity captured");

  rpcCalls = [];
  const production = await reverse(jar[U_PRODUCTION], "r-done", { reason: "x", supervisor: true, actor: "supervisor" });
  check("PRODUCTION with a browser-sent supervisor: true → 403", production.status === 403 && rpcCalls.length === 0);
  const sup = await reverse(jar[U_SUP], "r-done", { reason: "x", supervisor: true });
  check("SUPERVISOR (no reverse permission by default) → 403", sup.status === 403 && rpcCalls.length === 0);
  const anon = await reverse({}, "r-done", { reason: "x", supervisor: true });
  check("no session → 401/403", denied(anon) && rpcCalls.length === 0);
  const crossTenant = await reverse(jar[U_B_OWNER], "r-done", { reason: "x", companyId: CO_A });
  check("tenant B's OWNER naming tenant A's company → refused, nothing reversed", crossTenant.json?.ok !== true && rpcCalls.length === 0, `${crossTenant.status} ${JSON.stringify(crossTenant.json)}`);
  const ownTenant = await reverse(jar[U_B_OWNER], "r-done", { reason: "x" });
  check("tenant B's OWNER can only ever reach tenant B's company", rpcCalls.every((c) => c.args.p_company_id === CO_B) && ownTenant.status !== 401);
}

section("5. Production completion: permission-based, no PIN anywhere");
{
  resetDb();
  const r = await complete(jar[U_OWNER], "r-batch", { actual_qty: 100 });
  check("owner completes a normal run → 200, Completed", r.status === 200 && r.json?.run?.status === "Completed", JSON.stringify(r.json).slice(0, 300));
  check("completed_by is the verified member", r.json?.run?.completed_by === "Synthetic Owner", String(r.json?.run?.completed_by));

  const short = await complete(jar[U_OWNER], "r-short", { actual_qty: 2000 });
  check("a stock shortage without override → 409 with shortages", short.status === 409 && Array.isArray(short.json?.shortages));
  const noReason = await complete(jar[U_OWNER], "r-short", { actual_qty: 2000, stock_override: true, stock_override_reason: "  " });
  check("a stock override without a reason is refused", noReason.json?.ok !== true && rows("vyron_cost_production_runs").find((x) => x.id === "r-short").status !== "Completed");
  const override = await complete(jar[U_OWNER], "r-short", { actual_qty: 2000, stock_override: true, stock_override_reason: "Filling delivered, GRN not yet captured" });
  check("owner + stock override + reason → 200 (no PIN)", override.status === 200 && override.json?.run?.stock_override === true, JSON.stringify(override.json).slice(0, 300));
  const overrideAudit = rows("vyron_cost_production_audit_log").filter((a) => a.production_run_id === "r-short" && a.event_type === "Stock Override");
  check("the stock override is audited with who and why", overrideAudit.length === 1 && overrideAudit[0].actor === "Synthetic Owner" && /GRN not yet captured/.test(overrideAudit[0].detail || ""));

  resetDb();
  const clerk = await complete(jar[U_CLERK], "r-batch", { actual_qty: 100 });
  check("PROCUREMENT → 403", clerk.status === 403);
  const revoked = await complete(jar[U_SUP_REVOKED], "r-batch", { actual_qty: 100 });
  check("a SUPERVISOR with completion switched off → 403", revoked.status === 403);
  const crossTenant = await complete(jar[U_B_OWNER], "r-batch", { actual_qty: 100 });
  check("tenant B's OWNER cannot complete tenant A's run", crossTenant.json?.ok !== true && rows("vyron_cost_production_runs").find((x) => x.id === "r-batch").status === "Approved");
  const production = await complete(jar[U_PRODUCTION], "r-batch", { actual_qty: 100 });
  check("PRODUCTION (holds manufacturing.runs.complete) completes → 200", production.status === 200 && production.json?.run?.status === "Completed");
}

section("6. No shared PIN or fallback credential remains in the application");
{
  const SRC = path.join(ROOT, "src");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|txt)$/.test(name)) files.push(full);
    }
  };
  walk(SRC);
  const hits = (re) => files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
  check("no code reads process.env.VYRON_DOCUMENT_SUPERVISOR_PIN", hits(/process\.env\.VYRON_DOCUMENT_SUPERVISOR_PIN/).length === 0, hits(/process\.env\.VYRON_DOCUMENT_SUPERVISOR_PIN/).join(", "));
  check("the built-in default PIN literal is gone", hits(/["'`]vyron-supervisor["'`]|>vyron-supervisor</).length === 0, hits(/["'`]vyron-supervisor["'`]|>vyron-supervisor</).join(", "));
  check("isSupervisorAuthorized no longer exists", hits(/isSupervisorAuthorized/).length === 0, hits(/isSupervisorAuthorized/).join(", "));
  const screens = ["src/components/DocumentReviewWorkspace.tsx", "src/components/ArchiveInvoiceDetailClient.tsx", "src/components/ProductionRunsListClient.tsx", "src/components/ProductionRunDetailClient.tsx", "src/components/DocumentSupervisorSettings.tsx"];
  const pinScreens = screens.filter((f) => /Supervisor PIN|supervisorPin|overrideModal\.pin|>\s*PIN\s*</.test(readFileSync(path.join(ROOT, f), "utf8")));
  check("no supervisor screen asks for a PIN", pinScreens.length === 0, pinScreens.join(", "));
  const modeScreens = screens.filter((f) => /Supervisor mode|supervisor:\s*true/.test(readFileSync(path.join(ROOT, f), "utf8")));
  check("no screen sends a browser-side supervisor flag", modeScreens.length === 0, modeScreens.join(", "));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
