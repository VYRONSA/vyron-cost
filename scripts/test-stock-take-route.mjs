#!/usr/bin/env node
/**
 * VOLORA — Stock Take upload route: who is asking is checked before the request body is read.
 *
 *   signed out, no body / not a form / a real upload  → 401 (never a 500)
 *   signed in, no body / not a form / no file / bad action / damaged or wrong file → 400
 *   signed in, valid file → 200 preview, nothing written
 *
 * Drives the REAL route, login route and session modules against an in-memory database.
 * Family A: no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:stock-take-route
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
const CO = uuid("a", 1), WS = uuid("a", 2), U_OWNER = uuid("a", 10);
const seed = () => ({
  vyron_workspaces: [{ id: WS, company_id: CO, company_name: "QA Foods", package_name: "Enterprise", status: "Setup" }],
  vyron_workspace_memberships: [{ id: "m1", workspace_id: WS, user_id: U_OWNER, role: "OWNER", status: "Active", permissions: {} }],
  vyron_cost_stock_items: [{ id: "si-1", company_id: CO, item_code: "QA-1", description: "QA Flour", entity_type: "ingredient", entity_id: "ing-1", unit: "kg", qty_on_hand: 10, average_cost: 2, current_cost: 2, aliases: [], is_active: true }],
  vyron_cost_products: [],
  vyron_cost_stock_ledger: [],
  vyron_cost_stock_counts: [],
  vyron_cost_stock_count_lines: [],
  vyron_inventory_audit_log: [],
  vyron_inventory_settings: [],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: [{ id: U_OWNER, email: "owner@qa.test", password: "qa-pass-owner" }], cookies: new Map(), headers: {} };
const db = createFakeSupabase(seed());
globalThis.__VYRON_SESSION_TEST__.supabase = db;
globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const route = await importFromRoot("src/app/api/inventory/stock-take/route.ts");

setCookieJar({});
const loginRes = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: "owner@qa.test", password: "qa-pass-owner" }), headers: { "content-type": "application/json" } }));
const jar = Object.fromEntries(loginRes.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
check("synthetic owner signs in through the real login route", Boolean(jar.vyron_workspace_user_session));

const URL_ = "http://qa.local/api/inventory/stock-take";
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
const csvFile = (text, name = "count.csv") => new File([text], name, { type: "text/csv" });
async function call(signedIn, init) {
  setCookieJar(signedIn ? jar : {});
  const res = await route.POST(new Request(URL_, { method: "POST", ...init }));
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}
const writes = () => db.tables.vyron_cost_stock_counts.length + db.tables.vyron_cost_stock_ledger.length + db.tables.vyron_inventory_audit_log.length;

console.log("\nSigned out");
for (const [label, init] of [
  ["no body", {}],
  ["a JSON body", { body: "{}", headers: { "content-type": "application/json" } }],
  ["a broken multipart body", { body: "garbage", headers: { "content-type": "multipart/form-data; boundary=x" } }],
  ["a real upload", { body: form({ file: csvFile("Item Code,Counted Quantity\nQA-1,9\n"), countDate: "2026-10-01", action: "preview" }) }],
  ["a create request", { body: form({ file: csvFile("Item Code,Counted Quantity\nQA-1,9\n"), countDate: "2026-10-01", action: "create" }) }],
]) {
  const r = await call(false, init);
  check(`signed out with ${label} → 401`, r.status === 401 && /session required/i.test(r.json?.error || ""), JSON.stringify(r));
}

console.log("\nSigned in, bad requests → 400");
for (const [label, init, pattern] of [
  ["no body", {}, /multipart\/form-data/],
  ["a JSON body", { body: "{}", headers: { "content-type": "application/json" } }, /multipart\/form-data/],
  ["no file", { body: form({ countDate: "2026-10-01" }) }, /Choose a stock take file/],
  ["an unknown action", { body: form({ file: csvFile("x"), countDate: "2026-10-01", action: "post" }) }, /Unknown action/],
  ["no Stock Take Date", { body: form({ file: csvFile("Item Code,Counted Quantity\nQA-1,9\n") }) }, /Stock Take Date/],
  ["an empty file", { body: form({ file: csvFile(""), countDate: "2026-10-01" }) }, /empty/],
  ["a damaged Excel file", { body: form({ file: new File(["not a workbook"], "count.xlsx"), countDate: "2026-10-01" }) }, /not a valid workbook/],
  ["a PDF", { body: form({ file: new File(["%PDF-1.4"], "count.pdf", { type: "application/pdf" }), countDate: "2026-10-01" }) }, /\.xlsx\) or a CSV/],
  ["a legacy .xls", { body: form({ file: new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])], "count.xls"), countDate: "2026-10-01" }) }, /Save As/],
]) {
  const r = await call(true, init);
  check(`signed in with ${label} → 400`, r.status === 400 && pattern.test(r.json?.error || ""), JSON.stringify(r));
}
check("no bad request wrote anything", writes() === 0);

console.log("\nSigned in, valid upload");
{
  const r = await call(true, { body: form({ file: csvFile("QA-1,QA Flour,kg,STORE,9\n", "headerless.csv"), countDate: "2026-10-01", action: "preview" }) });
  check("headerless CSV preview → 200, first row read and matched", r.status === 200 && r.json?.ok && r.json.file?.layout === "headerless" && r.json.lines?.[0]?.status === "MATCHED" && r.json.lines[0].varianceQty === -1, JSON.stringify(r).slice(0, 400));
  check("preview wrote nothing; stock unchanged", writes() === 0 && db.tables.vyron_cost_stock_items[0].qty_on_hand === 10);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
