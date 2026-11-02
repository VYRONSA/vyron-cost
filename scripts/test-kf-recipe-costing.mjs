#!/usr/bin/env node
/**
 * VYRON — recipe (BOM) editor costing (Kingdom Foods, 2026-11).
 *
 *   - An ingredient line is costed from the verified supplier cost (usable cost
 *     = invoiced cost ÷ yield), converted into the line's unit: kg ↔ g, l ↔ ml.
 *   - A unit that cannot be converted is refused with a clear message.
 *   - A typed cost does not replace the verified cost, unless a member with
 *     boms.cost_override gives a reason — and that is written to the audit log.
 *
 * Drives the REAL /api/recipes and line routes (session, permissions, company)
 * against an in-memory database. No network, no real data.
 *
 *   npm run test:kf-recipe-costing
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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO = uuid("a", 1), WS = uuid("a", 2);
const U_OWNER = uuid("a", 10), U_EDITOR = uuid("a", 11);
const FLOUR = uuid("1", 1), OIL = uuid("1", 2), EGGS = uuid("1", 3), NEWBIE = uuid("1", 4);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase({
  vyron_workspaces: [{ id: WS, company_id: CO, company_name: "QA Bakery", package_name: "Enterprise", status: "Setup" }],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS, user_id: U_OWNER, role: "OWNER", status: "Active", permissions: {} },
    // An editor who may edit BOMs but holds no cost override.
    { id: "m2", workspace_id: WS, user_id: U_EDITOR, role: "PROCUREMENT", status: "Active", permissions: { "boms.view": true, "boms.create": true, "boms.edit": true, "boms.cost_override": false } },
  ],
  vyron_cost_ingredients: [
    { id: FLOUR, company_id: CO, ingredient_name: "Cake Flour", purchase_unit: "kg", purchase_cost: 14, yield_percent: 80, true_unit_cost: 17.5 },
    { id: OIL, company_id: CO, ingredient_name: "Sunflower Oil", purchase_unit: "l", purchase_cost: 30, yield_percent: 100, true_unit_cost: 30 },
    { id: EGGS, company_id: CO, ingredient_name: "Eggs (tray of 30)", purchase_unit: "kg", purchase_cost: 60, yield_percent: 100, true_unit_cost: 60 },
    { id: NEWBIE, company_id: CO, ingredient_name: "Vanilla (no invoice yet)", purchase_unit: "l", purchase_cost: 0, yield_percent: 100, true_unit_cost: 0 },
  ],
  vyron_cost_boms: [],
  vyron_cost_bom_lines: [],
  vyron_cost_bom_components: [],
  vyron_cost_products: [],
  vyron_cost_audit_log: [],
});
globalThis.__VYRON_SESSION_TEST__ = {
  supabase: db, browserSupabase: db,
  users: [{ id: U_OWNER, email: "owner@qa.test", password: "qa-pass-owner" }, { id: U_EDITOR, email: "editor@qa.test", password: "qa-pass-editor" }],
  cookies: new Map(), headers: {},
};
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const recipesRoute = await importFromRoot("src/app/api/recipes/route.ts");
const linesRoute = await importFromRoot("src/app/api/recipes/[id]/lines/route.ts");
const lineRoute = await importFromRoot("src/app/api/recipes/[id]/lines/[lineId]/route.ts");

async function login(email, password) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map();
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, url, method, body, params) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar));
  const saved = { warn: console.warn, log: console.log };
  console.warn = console.log = () => {};
  try {
    const res = await handler(new NextRequest(new URL(url, "http://qa.local"), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve(params || {}) });
    return { status: res.status, json: await res.json() };
  } finally {
    Object.assign(console, saved);
  }
}
const owner = await login("owner@qa.test", "qa-pass-owner");
const editor = await login("editor@qa.test", "qa-pass-editor");
check("synthetic owner and editor sign in", Boolean(owner.vyron_workspace_user_session && editor.vyron_workspace_user_session));

const line = (ingredient, name, qty, unit, cost, extra = {}) => ({ line_type: "Ingredient", ingredient_id: ingredient, line_name: name, quantity: qty, unit, unit_cost: cost, wastage_percent: 0, ...extra });

console.log("\n1. Units and yield");
const created = await call(editor, recipesRoute.POST, "/api/recipes", "POST", {
  recipe_name: "QA Sponge Base", bom_purpose: "Sub-BOM", yield_qty: 1,
  lines: [
    line(FLOUR, "Cake Flour", 500, "g", 17.5),    // per-kg cost typed on a gram line
    line(OIL, "Sunflower Oil", 250, "ml", 0),    // blank cost
    line(NEWBIE, "Vanilla", 10, "ml", 0.4),      // no verified cost yet
  ],
});
const bomId = created.json?.recipe?.id;
const lines = () => db.tables.vyron_cost_bom_lines.filter((l) => l.bom_id === bomId);
const byName = (n) => lines().find((l) => l.line_name === n);
check("the BOM is created", created.status === 200 && Boolean(bomId), JSON.stringify(created.json).slice(0, 200));
check("flour: R14/kg at 80% yield is R17.50/kg usable = R0.0175 per g (the typed R17.50 per g is replaced)", near(byName("Cake Flour").unit_cost, 0.0175), String(byName("Cake Flour").unit_cost));
check("…so 500 g costs R8.75, not R8,750", near(Number(byName("Cake Flour").quantity) * Number(byName("Cake Flour").unit_cost), 8.75));
check("oil: R30 per litre = R0.03 per ml", near(byName("Sunflower Oil").unit_cost, 0.03));
check("an ingredient with no verified cost keeps the typed cost", near(byName("Vanilla").unit_cost, 0.4));
check("the reply lists the corrected line so the screen can say so", (created.json?.costCorrections || []).some((c) => c.lineName === "Cake Flour" && c.action === "corrected" && near(c.verifiedCost, 0.0175)), JSON.stringify(created.json?.costCorrections));
const bom = db.tables.vyron_cost_boms.find((b) => b.id === bomId);
check("the BOM total uses the verified costs (8.75 + 7.50 + 4.00 = 20.25)", near(bom.total_cost, 20.25), String(bom.total_cost));

const bad = await call(editor, linesRoute.POST, `/api/recipes/${bomId}/lines`, "POST", line(EGGS, "Eggs", 2, "each", 2), { id: bomId });
check("a line in 'each' for an ingredient bought per kg is refused with what to use", bad.status === 400 && /bought per kg, so a line measured in "each" cannot be costed\. Use kg or g/.test(bad.json?.error || ""), JSON.stringify(bad.json));
check("…and nothing was added", !lines().some((l) => l.line_name === "Eggs"));

console.log("\n2. A typed cost does not override the supplier cost without authority");
const flourLine = byName("Cake Flour");
const noAuth = await call(editor, lineRoute.PATCH, `/api/recipes/${bomId}/lines/${flourLine.id}`, "PATCH", { unit_cost: 0.01, cost_override_reason: "Cheaper flour from the market" }, { id: bomId, lineId: flourLine.id });
check("an editor without boms.cost_override: the verified cost stays (R0.0175/g), the reason is not applied", noAuth.status === 200 && near(byName("Cake Flour").unit_cost, 0.0175) && /needs the boms\.cost_override permission/.test(JSON.stringify(noAuth.json?.costCorrections)), JSON.stringify(noAuth.json));
check("…and no override is written to the audit log", !db.tables.vyron_cost_audit_log.some((a) => a.event_type === "BOM Cost Override"));

const noReason = await call(owner, lineRoute.PATCH, `/api/recipes/${bomId}/lines/${flourLine.id}`, "PATCH", { unit_cost: 0.01 }, { id: bomId, lineId: flourLine.id });
check("even the owner: a typed cost with no reason is replaced by the verified cost", noReason.status === 200 && near(byName("Cake Flour").unit_cost, 0.0175));

const authorised = await call(owner, lineRoute.PATCH, `/api/recipes/${bomId}/lines/${flourLine.id}`, "PATCH", { unit_cost: 0.012, cost_override_reason: "Contract price agreed with QA Mill from November" }, { id: bomId, lineId: flourLine.id });
const audit = db.tables.vyron_cost_audit_log.find((a) => a.event_type === "BOM Cost Override");
check("the owner (holds boms.cost_override) with a reason: the typed cost is kept", authorised.status === 200 && near(byName("Cake Flour").unit_cost, 0.012), JSON.stringify(authorised.json).slice(0, 200));
check("…and the override is audited with who, both costs and the reason", audit && audit.company_id === CO && /kept R0\.012 per g instead of the verified supplier cost R0\.0175 per g\. Reason: Contract price agreed with QA Mill/.test(audit.event_detail) && audit.risk_level === "Medium", JSON.stringify(audit));

console.log("\n2b. A cost more than 2x from the supplier cost is kept for review, not replaced");
{
  // Production shape: a per-piece cost typed on a line whose unit is the supplier's pack.
  const before = db.tables.vyron_cost_audit_log.length;
  const held = await call(editor, linesRoute.POST, `/api/recipes/${bomId}/lines`, "POST", line(OIL, "Sunflower Oil (portion)", 1, "l", 2.5), { id: bomId });
  const heldLine = lines().find((l) => l.line_name === "Sunflower Oil (portion)");
  check("the typed R2.50 per l (12x below the R30 supplier cost) is kept, not pushed up to R30", held.status === 200 && heldLine && near(heldLine.unit_cost, 2.5), JSON.stringify(held.json).slice(0, 200));
  check("…reported as held so the screen can say so, and audited", (held.json?.costCorrections || []).some((c) => c.action === "held") && db.tables.vyron_cost_audit_log.slice(before).some((a) => a.event_type === "BOM Cost Held"), JSON.stringify(held.json?.costCorrections));
}

console.log("\n3. Changing the unit re-costs the line");
const toKg = await call(owner, lineRoute.PATCH, `/api/recipes/${bomId}/lines/${flourLine.id}`, "PATCH", { quantity: 0.5, unit: "kg" }, { id: bomId, lineId: flourLine.id });
check("switching Cake Flour to kg costs it at R17.50 per kg", toKg.status === 200 && byName("Cake Flour").unit === "kg" && near(byName("Cake Flour").unit_cost, 17.5), JSON.stringify(byName("Cake Flour")));
const moveOnly = await call(owner, lineRoute.PATCH, `/api/recipes/${bomId}/lines/${byName("Vanilla").id}`, "PATCH", { component_id: null }, { id: bomId, lineId: byName("Vanilla").id });
check("a change that does not touch the cost (regrouping) leaves the line's cost alone", moveOnly.status === 200 && near(byName("Vanilla").unit_cost, 0.4));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
