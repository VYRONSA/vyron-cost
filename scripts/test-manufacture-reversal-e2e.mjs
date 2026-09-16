#!/usr/bin/env node
/**
 * VYRON — Manufacture reversal END-TO-END through the real application route
 * (Phase 34). Runs against an ISOLATED local stack only (NEVER production).
 *
 * Proves, through POST /api/production/runs/:id/reverse (authenticated, signed
 * session) → reverse_production_run RPC:
 *   - product.total_cost restored EXACTLY to the completion-time snapshot,
 *   - raw restored / finished goods removed, status Completed→Reversed, audit,
 *   - a second reversal returns already_reversed with no duplicate set,
 *   - a downstream-issued run is blocked with a structured 409,
 *   - the route rejects unauthenticated / supervisor=false / missing reason /
 *     >500-char reason, and never exposes a browser-direct write path.
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/test-manufacture-reversal-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const base = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3007";
if (/pnbstrqsrfoubdgcgimi|supabase\.co/.test(url)) { console.error("REFUSING: not an isolated/local database:", url); process.exit(2); }
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}${d ? ` — ${d}` : ""}`); } };

async function api(path, { method = "POST", body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie: (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ") };
}

const stamp = Date.now();
const email = `mr-e2e-${stamp}@example.com`, password = "Reversal123!";
let companyId, workspaceId, userId, cookie;

async function bootstrap() {
  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error) throw auth.error; userId = auth.data.user.id;
  const co = await supabase.from("vyron_cost_companies").insert({ name: `MR E2E ${stamp}`, trading_name: `MR E2E ${stamp}` }).select("id,name,trading_name").single();
  if (co.error) throw co.error; companyId = co.data.id;
  const ws = await supabase.from("vyron_workspaces").insert({ company_id: companyId, company_name: co.data.name, trading_name: co.data.trading_name, package_name: "Professional", status: "Live", user_limit: 10, owner_user_id: userId, contact_email: email }).select("id").single();
  if (ws.error) throw ws.error; workspaceId = ws.data.id;
  await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "MR", surname: "E2E", status: "Active" }, { onConflict: "id" });
  await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });
  const login = await api("/api/workspace/login", { body: { email, password } });
  if (!login.data.ok) throw new Error("login failed: " + JSON.stringify(login.data));
  cookie = login.setCookie;
}

/** Seed a Completed run + product + stock + posted transactions (as completion would leave them). */
async function seedCompletedRun({ prevCost = 8.25, currentCost = 9.1, fgOnHand = 10, downstream = 0 } = {}) {
  const runId = randomUUID(), productId = randomUUID(), fgItem = randomUUID();
  const comps = [{ id: randomUUID(), ing: randomUUID(), qty: 4, cost: 6 }, { id: randomUUID(), ing: randomUUID(), qty: 6, cost: 5 }, { id: randomUUID(), ing: randomUUID(), qty: 2, cost: 7 }];
  await supabase.from("vyron_cost_products").insert({ id: productId, company_id: companyId, product_name: "E2E Pie", total_cost: currentCost });
  await supabase.from("vyron_cost_production_runs").insert({ id: runId, company_id: companyId, run_number: `MR-${String(runId).slice(0, 6)}`, bom_name_snapshot: "E2E BOM", product_name_snapshot: "E2E Pie", status: "Completed", product_id: productId, actual_qty: 10, cost_per_unit: currentCost, actual_cost: 100, previous_product_total_cost: prevCost });
  await supabase.from("vyron_cost_stock_items").insert({ id: fgItem, company_id: companyId, item_code: `FG-${String(fgItem).slice(0, 8)}`, description: "E2E Pie", entity_type: "finished_goods", entity_id: productId, qty_on_hand: fgOnHand, average_cost: currentCost, current_cost: currentCost });
  const rn = String(runId).slice(0, 8);
  await supabase.from("vyron_cost_inventory_transactions").insert({ company_id: companyId, transaction_number: `IT-R-${rn}`, transaction_type: "Receipt", entity_type: "finished_goods", entity_id: productId, stock_item_id: fgItem, quantity: 10, unit_cost: currentCost, total_cost: 10 * currentCost, reference_type: "production_run", reference_id: runId, created_by: "seed" });
  for (const c of comps) {
    await supabase.from("vyron_cost_stock_items").insert({ id: c.id, company_id: companyId, item_code: `ING-${String(c.id).slice(0, 6)}`, description: "comp", entity_type: "ingredient", entity_id: c.ing, qty_on_hand: 100, average_cost: c.cost, current_cost: c.cost });
    await supabase.from("vyron_cost_inventory_transactions").insert({ company_id: companyId, transaction_number: `IT-C-${String(c.id).slice(0, 6)}`, transaction_type: "Consumption", entity_type: "ingredient", entity_id: c.ing, stock_item_id: c.id, quantity: c.qty, unit_cost: c.cost, total_cost: c.qty * c.cost, reference_type: "production_run", reference_id: runId, created_by: "seed" });
  }
  for (let d = 0; d < downstream; d++) await supabase.from("vyron_cost_inventory_transactions").insert({ company_id: companyId, transaction_number: `IT-D-${d}-${String(runId).slice(0,8)}`, transaction_type: "Consumption", entity_type: "finished_goods", entity_id: productId, stock_item_id: fgItem, quantity: 1, unit_cost: currentCost, total_cost: currentCost, reference_type: "customer_invoice", reference_id: randomUUID(), created_by: "seed" });
  return { runId, productId, fgItem, comps };
}
const qtyOf = async (id) => Number((await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", id).single()).data.qty_on_hand);
const prodCost = async (id) => Number((await supabase.from("vyron_cost_products").select("total_cost").eq("id", id).single()).data.total_cost);
const revTxns = async (runId) => Number((await supabase.from("vyron_cost_inventory_transactions").select("id", { count: "exact", head: true }).eq("reference_type", "production_run_reversal").eq("reference_id", runId)).count || 0);

async function run() {
  await bootstrap();
  check("bootstrap: authenticated workspace session established", Boolean(cookie && cookie.includes("vyron_workspace_user_session")));

  const { runId, productId, fgItem, comps } = await seedCompletedRun();
  const rev = (b, c) => api(`/api/production/runs/${runId}/reverse`, { cookie: c, body: b });

  // ── Step 8 security (through the route) ──
  check("8. unauthenticated reversal -> 401/403", await (async () => { const r = await api(`/api/production/runs/${runId}/reverse`, { body: { reason: "x", supervisor: true } }); return r.status === 401 || r.status === 403; })());
  check("8. missing/blank reason -> 400", (await rev({ reason: "   ", supervisor: true }, cookie)).status === 400);
  check("8. reason >500 chars -> 400", (await rev({ reason: "x".repeat(501), supervisor: true }, cookie)).status === 400);
  check("8. supervisor=false rejected (not reversed)", !(await rev({ reason: "valid reason", supervisor: false }, cookie)).data.ok);
  check("8. no writes after rejected reversals; run stays Completed", (await revTxns(runId)) === 0 && (await supabase.from("vyron_cost_production_runs").select("status").eq("id", runId).single()).data.status === "Completed");

  // ── Step 7 happy path through the route ──
  const before = []; for (const c of comps) before.push(await qtyOf(c.id));
  const ok = await rev({ reason: "Wrong batch qty — should have been 8", actor: "supervisor", supervisor: true }, cookie);
  check("7. authenticated reversal via route succeeds -> Reversed", ok.data.ok && ok.data.run?.status === "Reversed", JSON.stringify(ok.data).slice(0, 120));
  check("7. product.total_cost restored EXACTLY to the completion snapshot (8.25)", (await prodCost(productId)) === 8.25, String(await prodCost(productId)));
  check("7. finished goods removed (10 -> 0)", (await qtyOf(fgItem)) === 0);
  let restored = true; for (let i = 0; i < comps.length; i++) if (Math.abs(await qtyOf(comps[i].id) - (before[i] + comps[i].qty)) > 1e-6) restored = false;
  check("7. raw materials restored exactly", restored);
  check("7. compensating transactions created (3 raw receipts + 1 fg consumption)", (await revTxns(runId)) === 4);
  check("7. audit record exists (Production Reversed)", Number((await supabase.from("vyron_cost_production_audit_log").select("id", { count: "exact", head: true }).eq("production_run_id", runId).eq("event_type", "Production Reversed")).count || 0) === 1);

  // ── idempotency through the route ──
  const again = await rev({ reason: "second attempt", supervisor: true }, cookie);
  check("7. second reversal via route -> already reversed, no error", again.data.ok && again.data.run?.status === "Reversed", JSON.stringify(again.data).slice(0, 80));
  check("7. no duplicate reversal set (still 4 compensating txns)", (await revTxns(runId)) === 4);

  // ── 409 downstream block through the route ──
  const blocked = await seedCompletedRun({ fgOnHand: 3, downstream: 7 });
  const b = await api(`/api/production/runs/${blocked.runId}/reverse`, { cookie, body: { reason: "attempt on issued stock", supervisor: true } });
  check("7/8. downstream-issued run blocked with 409 + details", b.status === 409 && Number(b.data.details?.produced) === 10 && Number(b.data.details?.available) === 3 && Number(b.data.details?.shortfall) === 7, `${b.status} ${JSON.stringify(b.data.details)}`);
  check("7/8. blocked run made no reversal writes and stays Completed", (await revTxns(blocked.runId)) === 0 && (await supabase.from("vyron_cost_production_runs").select("status").eq("id", blocked.runId).single()).data.status === "Completed");

  await cleanup();
  console.log(`\n${pass}/${pass + fail} e2e checks passed`);
  if (fail) process.exit(1);
}

async function cleanup() {
  await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId);
  await supabase.from("vyron_workspaces").delete().eq("id", workspaceId);
  await supabase.from("vyron_cost_companies").delete().eq("id", companyId);
  try { await supabase.auth.admin.deleteUser(userId); } catch {}
}

run().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
