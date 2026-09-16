#!/usr/bin/env node
/**
 * VYRON — Food Sock migration EXECUTOR regression test.
 *
 * Runs the real executor, and VYRON's own writers behind it (createRecipe,
 * findOrCreateStockItem, postOpeningStockMovement, upsertVyronContact) and the
 * real manufacturing engine, against an in-memory database holding two
 * DISPOSABLE synthetic tenants:
 *
 *   A  "QA Pantry"        — the tenant being imported into
 *   B  "Other QA Tenant"  — pre-seeded with look-alike records (same supplier
 *                           name, same ingredient name, same SKU) that must be
 *                           neither matched nor touched
 *
 * No client data, no real database, no network. Family A.
 *
 *   npm run test:food-sock-execute
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./support/migration-hook.mjs", import.meta.url);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { buildFoodSockPlan, emptyTarget } = await import("../src/lib/data-migration/food-sock-plan.ts");
const { executeFoodSockPlan: executeWithGates, executionAcknowledgement, selectExecutionItems, ExecutionRefused } = await import("../src/lib/data-migration/food-sock-execute.ts");
/** Supplies a valid approval unless the caller passes its own (the barrier tests do). */
const approvalFor = (planHash, companyId, scope) => ({ approver: "QA Approver", acknowledgement: executionAcknowledgement(planHash, companyId, scope) });
const executeFoodSockPlan = (db, plan, options) => executeWithGates(db, plan, { approval: approvalFor(plan.planHash, options.companyId, options.scope), ...options });
const core = await import("../src/lib/data-migration/core.ts");
const manufacturing = await import("../src/lib/vyron-manufacturing.ts");

let failures = 0;
let checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}
const section = (title) => console.log(`\n${title}`);
const { qaFixture } = await import("./support/food-sock-qa-fixture.mjs");
const { A, B, C, qaSources, B_ROWS, seed } = qaFixture(core);

function snapshot(db, companyId) {
  const t = emptyTarget(companyId);
  const own = (table) => (db.tables[table] || []).filter((row) => row.company_id === companyId);
  t.suppliers = own("vyron_cost_suppliers").map((r) => ({ id: r.id, supplier_name: r.supplier_name }));
  t.ingredients = own("vyron_cost_ingredients").map((r) => ({ id: r.id, ingredient_name: r.ingredient_name }));
  t.products = own("vyron_cost_products").map((r) => ({ id: r.id, product_name: r.product_name, sku: r.sku ?? null }));
  t.boms = own("vyron_cost_boms").map((r) => ({ id: r.id, bom_name: r.bom_name, product_id: r.product_id ?? null }));
  t.stockItems = own("vyron_cost_stock_items").map((r) => ({ id: r.id, item_code: r.item_code, entity_type: r.entity_type, entity_id: r.entity_id ?? null }));
  t.sourceLinks = own("vyron_import_source_links").map((r) => ({ source_system: r.source_system, source_entity: r.source_entity, source_key: r.source_key, entity_type: r.entity_type, entity_id: r.entity_id }));
  return t;
}

const rowCounts = (db) => Object.fromEntries(Object.entries(db.tables).map(([table, rows]) => [table, rows.length]));
const tenantRows = (db, table, companyId = A) => (db.tables[table] || []).filter((row) => row.company_id === companyId);
async function refused(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ExecutionRefused ? error.message : `NOT A REFUSAL: ${error?.message}`;
  }
}

/* ============================================================== refusals */

section("Refusals — nothing is written");
{
  const db = createFakeSupabase(seed());
  const plan = buildFoodSockPlan(qaSources(), snapshot(db, A));
  const before = JSON.stringify(db.tables);
  check("wrong approved hash is refused", /not the approved plan/.test((await refused(executeFoodSockPlan(db, plan, { companyId: A, approvedPlanHash: "deadbeef", scope: "all_planned" }))) || ""));
  const newTenantPlan = buildFoodSockPlan(qaSources());
  check("a plan built for a new tenant is refused", /not built against this tenant/.test((await refused(executeFoodSockPlan(db, newTenantPlan, { companyId: A, approvedPlanHash: newTenantPlan.planHash, scope: "all_planned" }))) || ""));
  check("a plan for tenant A cannot run against tenant B", /not built against this tenant/.test((await refused(executeFoodSockPlan(db, plan, { companyId: B, approvedPlanHash: plan.planHash, scope: "all_planned" }))) || ""));
  const ghost = buildFoodSockPlan(qaSources(), emptyTarget(C));
  check("an unknown company is refused", /does not exist/.test((await refused(executeFoodSockPlan(db, ghost, { companyId: C, approvedPlanHash: ghost.planHash, scope: "all_planned" }))) || ""));
  const noLinks = createFakeSupabase(seed(), { missingTables: ["vyron_import_source_links"] });
  check("missing source-link table is refused (apply the migration first)", /Apply migration 20260910170000/.test((await refused(executeFoodSockPlan(noLinks, plan, { companyId: A, approvedPlanHash: plan.planHash, scope: "all_planned" }))) || ""));
  check("refusals wrote nothing", JSON.stringify(db.tables) === before);
}

/* ======================================================= safety barrier */

section("Safety barrier — every gate refuses before the first database access");
{
  const db = createFakeSupabase(seed());
  let queries = 0;
  const counted = new Proxy(db, { get: (target, key) => (key === "from" ? (...a) => ((queries += 1), target.from(...a)) : target[key]) });
  const plan = buildFoodSockPlan(qaSources(), snapshot(db, A));
  const valid = { companyId: A, approvedPlanHash: plan.planHash, scope: "demo", approval: approvalFor(plan.planHash, A, "demo") };
  const before = JSON.stringify(db.tables);
  const refusedBeforeAnyQuery = async (name, plan_, options, pattern) => {
    queries = 0;
    const message = await refused(executeWithGates(counted, plan_, options));
    check(`${name}: refused before any query`, pattern.test(message || "") && queries === 0, `${message} (queries: ${queries})`);
  };
  await refusedBeforeAnyQuery("wrong tenant", plan, { ...valid, companyId: B, approval: approvalFor(plan.planHash, B, "demo") }, /not built against this tenant/);
  await refusedBeforeAnyQuery("wrong plan hash", plan, { ...valid, approvedPlanHash: "0".repeat(64) }, /not the approved plan/);
  await refusedBeforeAnyQuery("no plan hash", plan, { ...valid, approvedPlanHash: "" }, /not the approved plan/);
  const generic = buildFoodSockPlan(qaSources());
  await refusedBeforeAnyQuery("generic new-tenant plan", generic, { ...valid, approvedPlanHash: generic.planHash, approval: approvalFor(generic.planHash, A, "demo") }, /not built against this tenant/);
  await refusedBeforeAnyQuery("missing acknowledgement", plan, { ...valid, approval: { approver: "QA Approver", acknowledgement: "" } }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("acknowledgement typed for another tenant", plan, { ...valid, approval: approvalFor(plan.planHash, B, "demo") }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("acknowledgement typed for another plan", plan, { ...valid, approval: approvalFor(generic.planHash, A, "demo") }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("missing approver", plan, { ...valid, approval: { ...valid.approval, approver: "   " } }, /No named approver/);
  await refusedBeforeAnyQuery("no approval at all", plan, { companyId: A, approvedPlanHash: plan.planHash, scope: "demo" }, /No named approver/);
  await refusedBeforeAnyQuery("unknown scope", plan, { ...valid, scope: "everything" }, /Unknown scope/);

  // The approval is bound to the execution scope.
  await refusedBeforeAnyQuery("missing scope", plan, { ...valid, scope: undefined }, /No execution scope/);
  await refusedBeforeAnyQuery("malformed scope", plan, { ...valid, scope: "Demo ", approval: approvalFor(plan.planHash, A, "Demo ") }, /Unknown scope/);
  await refusedBeforeAnyQuery("demo acknowledgement + all_planned scope", plan, { ...valid, scope: "all_planned" }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("all_planned acknowledgement + demo scope", plan, { ...valid, approval: approvalFor(plan.planHash, A, "all_planned") }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("acknowledgement missing its scope (old form)", plan, { ...valid, approval: { approver: "QA Approver", acknowledgement: `IMPORT FOOD SOCK PLAN ${plan.planHash.slice(0, 12)} INTO ${A}` } }, /Acknowledgement missing or wrong/);
  await refusedBeforeAnyQuery("acknowledgement for another scope", plan, { ...valid, approval: approvalFor(plan.planHash, A, "everything") }, /Acknowledgement missing or wrong/);

  // A hash approved yesterday cannot run against a tenant that changed since.
  db.tables.vyron_cost_suppliers = [...(db.tables.vyron_cost_suppliers || []), { id: "sup-late", company_id: A, supplier_name: "QA Mills" }];
  const replanned = buildFoodSockPlan(qaSources(), snapshot(db, A));
  check("a tenant change produces a different plan hash", replanned.planHash !== plan.planHash);
  queries = 0;
  const stale = await refused(executeWithGates(counted, replanned, valid));
  check("stale approved hash: refused before any query", /not the approved plan/.test(stale || "") && queries === 0, stale);
  db.tables.vyron_cost_suppliers = db.tables.vyron_cost_suppliers.filter((r) => r.id !== "sup-late");
  check("refusals wrote nothing", JSON.stringify(db.tables) === before);

  const first = await executeWithGates(db, plan, valid);
  check("all gates satisfied in the QA tenant: execution succeeds", first.results.some((r) => r.status === "created") && first.results.every((r) => r.status !== "failed") && first.reconciliation.length === 0);
  const runRow = tenantRows(db, "vyron_import_runs").find((r) => r.id === first.runId);
  check("the run records the full plan hash and the named approver", runRow?.file_name.includes(plan.planHash) && runRow.file_name.includes("approved by QA Approver"), runRow?.file_name);
  const audit = runRow?.error_report?.[0] || {};
  check(
    "demo acknowledgement + demo scope: the audit record holds tenant, full hash, scope, approver, times and result as fields",
    audit.kind === "execution_approval" && runRow.company_id === A && audit.tenant_id === A && audit.plan_hash === plan.planHash && audit.scope === "demo" &&
      audit.approver === "QA Approver" && audit.acknowledgement === executionAcknowledgement(plan.planHash, A, "demo") &&
      Boolean(audit.started_at) && Boolean(audit.finished_at) && audit.result === "Completed" && runRow.status === "Completed" && audit.record_totals?.created > 0,
    JSON.stringify(audit)
  );
  const countsAfterFirst = rowCounts(db);
  const second = await executeWithGates(db, plan, valid);
  check("second execution: zero creates", second.results.every((r) => r.status !== "created" && r.status !== "failed"));
  const countsAfterSecond = rowCounts(db);
  const dbAll = createFakeSupabase(seed());
  const planAll = buildFoodSockPlan(qaSources(), snapshot(dbAll, A));
  const all = await executeWithGates(dbAll, planAll, { companyId: A, approvedPlanHash: planAll.planHash, scope: "all_planned", approval: approvalFor(planAll.planHash, A, "all_planned") });
  const allAudit = tenantRows(dbAll, "vyron_import_runs").find((r) => r.id === all.runId)?.error_report?.[0];
  check("all_planned acknowledgement + all_planned scope: succeeds in the synthetic QA tenant", all.results.some((r) => r.status === "created") && all.results.every((r) => r.status !== "failed") && allAudit?.scope === "all_planned");
  check("second execution: no new rows except its own run record",Object.keys(countsAfterSecond).every((t) => t === "vyron_import_runs" ? countsAfterSecond[t] === countsAfterFirst[t] + 1 : countsAfterSecond[t] === countsAfterFirst[t]));
}

/* ============================================================ full import */

section("Full import into tenant A");
const db = createFakeSupabase(seed());
const plan = buildFoodSockPlan(qaSources(), snapshot(db, A));
const report = await executeFoodSockPlan(db, plan, { companyId: A, approvedPlanHash: plan.planHash, scope: "all_planned" });
check("no record failed", report.results.every((r) => r.status !== "failed"), JSON.stringify(report.results.filter((r) => r.status === "failed")));
check("reconciliation is clean", report.reconciliation.length === 0, JSON.stringify(report.reconciliation));

const supplierA = tenantRows(db, "vyron_cost_suppliers")[0];
check("supplier created in A", tenantRows(db, "vyron_cost_suppliers").length === 1 && supplierA.supplier_name === "QA Mills");
check("supplier carries only source data (no invented payment terms)", !("payment_terms" in supplierA) && supplierA.notes === "Contact person: Pat");
check("contact master entry for A", tenantRows(db, "vyron_contacts").length === 1 && tenantRows(db, "vyron_contacts")[0].is_supplier === true);

const flour = tenantRows(db, "vyron_cost_ingredients").find((r) => r.ingredient_name === "QA Flour");
check("ingredient in A at the exact kg cost", flour?.purchase_cost === 12.35 && flour?.true_unit_cost === 12.35 && flour?.purchase_unit === "kg");
check("ingredient linked to A's supplier, never B's", flour?.supplier_id === supplierA.id && flour?.supplier_id !== "b-supplier-1");
check("no invented previous cost", flour?.previous_cost === null);
const flourStock = tenantRows(db, "vyron_cost_stock_items").find((r) => r.entity_id === flour?.id);
check("stock item uses VYRON's ING- convention and is entity-linked", flourStock?.item_code === `ING-${flour.id.slice(0, 8).toUpperCase()}` && flourStock?.entity_type === "ingredient");
check("reorder levels not invented (0 = not set)", flourStock?.reorder_level === 0 && flourStock?.min_level === 0 && flourStock?.max_level === 0);
const bag = tenantRows(db, "vyron_cost_ingredients").find((r) => r.ingredient_name === "QA Bag");
check("packaging stock item typed packaging", tenantRows(db, "vyron_cost_stock_items").find((r) => r.entity_id === bag?.id)?.entity_type === "packaging");
check("TBC-cost item was not written", !tenantRows(db, "vyron_cost_ingredients").some((r) => r.ingredient_name === "QA Salt"));

const loaf = tenantRows(db, "vyron_cost_products").find((r) => r.sku === "QA-1");
check("product in A with its source price; target margin not invented", loaf?.selling_price === 20 && loaf?.target_gp === 0);
check("finished-goods stock item uses FG- convention", tenantRows(db, "vyron_cost_stock_items").some((r) => r.entity_type === "finished_goods" && r.entity_id === loaf?.id && r.item_code === `FG-${loaf.id.slice(0, 8).toUpperCase()}`));

const bom = tenantRows(db, "vyron_cost_boms").find((r) => r.product_id === loaf?.id);
check("BOM created as Draft (no invented approval) for A's product", bom?.status === "Draft" && bom?.bom_purpose === "Finished Good");
const lines = tenantRows(db, "vyron_cost_bom_lines").filter((l) => l.bom_id === bom?.id);
const flourLine = lines.find((l) => l.line_name === "QA Flour");
const bagLine = lines.find((l) => l.line_name === "QA Bag");
check("BOM lines linked to A's ingredients, typed for production", flourLine?.ingredient_id === flour?.id && flourLine?.line_type === "Ingredient" && bagLine?.line_type === "Packaging");
check("BOM quantities and costs exact (0.25 kg @ 12.35, 1 bag @ 2.03)", flourLine?.quantity === 0.25 && flourLine?.unit_cost === 12.35 && bagLine?.quantity === 1 && bagLine?.unit_cost === 2.03);
check("BOM cost computed by VYRON: 5.12 (3.0875 ingredient + 2.03 packaging)", bom?.total_cost === 5.12 && bom?.ingredient_cost === 3.0875 && bom?.packaging_cost === 2.03, JSON.stringify({ t: bom?.total_cost, i: bom?.ingredient_cost, p: bom?.packaging_cost }));
check("product linked to its BOM and costed from it", loaf?.linked_bom_id === bom?.id && loaf?.total_cost === 5.12);

const opening = tenantRows(db, "vyron_cost_stock_ledger").filter((r) => r.movement_type === "Opening Balance");
check("opening balances posted through the canonical writer", opening.length === 2);
check("flour on hand 12.345678 kg at 12.35", flourStock && tenantRows(db, "vyron_cost_stock_items").find((r) => r.id === flourStock.id)?.qty_on_hand === 12.345678 && tenantRows(db, "vyron_cost_stock_items").find((r) => r.id === flourStock.id)?.average_cost === 12.35);
check("opening reference cites the source row and quantity", /Source row 2; source quantity 12345\.678 grams/.test(opening.find((r) => r.stock_item_id === flourStock?.id)?.reference_label || ""));

const links = tenantRows(db, "vyron_import_source_links");
check("one source link per written record", links.length === report.results.filter((r) => r.stage !== "B_categories").length, `${links.length} links`);
check("links carry provenance and the run id", links.every((l) => l.import_run_id === report.runId && l.source_file && l.source_row && l.content_hash));
check("import run recorded as Completed for A", tenantRows(db, "vyron_import_runs").find((r) => r.id === report.runId)?.status === "Completed");

section("Tenant isolation");
for (const [table, rows] of Object.entries(B_ROWS)) {
  check(`${table}: tenant B rows untouched`, JSON.stringify(tenantRows(db, table, B)) === JSON.stringify(rows));
}
const stray = Object.entries(db.tables).flatMap(([table, rows]) => rows.filter((row) => "company_id" in row && row.company_id !== A && row.company_id !== B).map((row) => `${table}:${row.id}`));
check("every written row carries tenant A's company id", stray.length === 0, stray.join(", "));
check("the executor contains no delete", !/\.delete\(/.test(readFileSync(new URL("../src/lib/data-migration/food-sock-execute.ts", import.meta.url), "utf8")));

/* ============================================================ idempotency */

section("Idempotency and restart");
const counts = rowCounts(db);
const again = await executeFoodSockPlan(db, plan, { companyId: A, approvedPlanHash: plan.planHash, scope: "all_planned" });
check("re-running the same plan creates nothing", again.results.every((r) => r.status === "already_imported" || (r.stage === "B_categories" && r.status === "linked_existing")), JSON.stringify(again.counts));
check("no table grew except the import-run log", Object.entries(rowCounts(db)).every(([t, c]) => (t === "vyron_import_runs" ? c === counts[t] + 1 : c === counts[t])));
check("no second opening balance", tenantRows(db, "vyron_cost_stock_ledger").filter((r) => r.movement_type === "Opening Balance").length === 2);

const replan = buildFoodSockPlan(qaSources(), snapshot(db, A));
check("re-planning against the populated tenant matches through source links", ["C_suppliers", "E_stock_items", "F_finished_goods"].every((s) => replan.stages[s].items.filter((i) => i.action === "create").length === 0));
const counts2 = rowCounts(db);
const replanRun = await executeFoodSockPlan(db, replan, { companyId: A, approvedPlanHash: replan.planHash, scope: "all_planned" });
check("executing the re-plan writes no master data", replanRun.results.every((r) => r.status !== "created") && rowCounts(db).vyron_cost_ingredients === counts2.vyron_cost_ingredients);

const flourLink = db.tables.vyron_import_source_links.findIndex((l) => l.company_id === A && l.source_key === "product:name:qa flour");
db.tables.vyron_import_source_links.splice(flourLink, 1); // simulate a run interrupted after the row, before its link
const resumed = await executeFoodSockPlan(db, plan, { companyId: A, approvedPlanHash: plan.planHash, scope: "all_planned" });
check("interrupted record resumes by exact identity, no duplicate", resumed.results.find((r) => r.sourceKey === "product:name:qa flour")?.status === "linked_existing" && tenantRows(db, "vyron_cost_ingredients").filter((r) => r.ingredient_name === "QA Flour").length === 1);
check("its link is restored", tenantRows(db, "vyron_import_source_links").some((l) => l.source_key === "product:name:qa flour"));

/* ============================================================ dependencies */

section("A failed dependency blocks its dependants; nothing is written blank");
{
  const dbFail = createFakeSupabase(seed(), { failOn: { table: "vyron_cost_suppliers", call: 2 } });
  const p = buildFoodSockPlan(qaSources(), snapshot(dbFail, A));
  const r = await executeFoodSockPlan(dbFail, p, { companyId: A, approvedPlanHash: p.planHash, scope: "all_planned" });
  check("supplier failure recorded", r.results.find((x) => x.stage === "C_suppliers")?.status === "failed");
  check("ingredients needing that supplier are not written", r.results.filter((x) => x.stage === "E_stock_items").every((x) => x.status === "failed") && tenantRows(dbFail, "vyron_cost_ingredients").length === 0);
  check("BOM needing those ingredients is not written", tenantRows(dbFail, "vyron_cost_boms").length === 0);
  check("opening stock for them is not posted", tenantRows(dbFail, "vyron_cost_stock_ledger").length === 0);
  check("the run says so", tenantRows(dbFail, "vyron_import_runs")[0]?.status === "Completed with issues");
}

/* ================================================================ scope */

section("Demo scope writes only the demo set and what it needs");
{
  const all = selectExecutionItems(plan, "all_planned");
  const demo = selectExecutionItems(plan, "demo");
  check("discontinued product is in the full plan", all.F_finished_goods.some((i) => i.sourceKey === "product:sku:QA-OLD"));
  check("…but not in the demo scope", !demo.F_finished_goods.some((i) => i.sourceKey === "product:sku:QA-OLD") && demo.F_finished_goods.some((i) => i.sourceKey === "product:sku:QA-1"));
  check("demo scope carries the components, supplier and opening stock it needs", demo.E_stock_items.length === 2 && demo.C_suppliers.length === 1 && demo.K_opening_stock.length === 2);
}

/* ===================================================== purchase / receive */

section("Purchase and receive on the imported data (VYRON procurement engine)");
{
  const procurement = await import("../src/lib/vyron-procurement.ts");
  const flourItem = () => tenantRows(db, "vyron_cost_stock_items").find((r) => r.entity_id === flour.id);
  const qtyBefore = flourItem().qty_on_hand;
  const ledgerBefore = tenantRows(db, "vyron_cost_stock_ledger").length;
  const saved = await procurement.savePurchaseOrder(db, A, {
    po_number: "QA-PO-0001",
    supplier_id: supplierA.id,
    supplier_name_snapshot: supplierA.supplier_name,
    status: "Draft",
    lines: [{ item_type: "ingredient", item_id: flour.id, item_name: "QA Flour", quantity: 10, unit: "kg", unit_price: 12.35 }],
  }, "qa");
  const po = tenantRows(db, "vyron_cost_purchase_orders").find((r) => r.po_number === "QA-PO-0001");
  check("PO created in tenant A for A's supplier", Boolean(po) && po.supplier_id === supplierA.id && Boolean(saved));
  const poLines = tenantRows(db, "vyron_cost_purchase_order_lines").filter((l) => l.purchase_order_id === po.id);
  check("PO line references A's imported stock item", poLines.length === 1 && poLines[0].item_id === flour.id && poLines[0].item_type === "ingredient");
  await procurement.transitionPurchaseOrder(db, po.id, "Submitted", A, { actor: "qa" });
  if (tenantRows(db, "vyron_cost_purchase_orders").find((r) => r.id === po.id).status !== "Approved") {
    await procurement.transitionPurchaseOrder(db, po.id, "Approved", A, { approvedBy: "qa", actor: "qa" });
  }
  check("PO approved through the normal transition", tenantRows(db, "vyron_cost_purchase_orders").find((r) => r.id === po.id).status === "Approved");
  await procurement.createGoodsReceipt(db, A, {
    purchase_order_id: po.id,
    receipt_type: "full",
    received_by: "qa",
    lines: [{ purchase_order_line_id: poLines[0].id, item_name: "QA Flour", ordered_qty: 10, received_qty: 10, unit: "kg" }],
  }, "qa");
  check("goods receipt recorded in tenant A", tenantRows(db, "vyron_cost_goods_receipts").some((g) => g.purchase_order_id === po.id));
  check("received into the SAME imported stock item (no duplicate)", tenantRows(db, "vyron_cost_stock_items").filter((r) => r.entity_id === flour.id).length === 1);
  check("available quantity rises by exactly 10 kg", Math.abs(flourItem().qty_on_hand - (qtyBefore + 10)) < 1e-9, `${qtyBefore} → ${flourItem().qty_on_hand}`);
  check("cost stays 12.35 (same price as opening)", flourItem().average_cost === 12.35);
  const grnRows = tenantRows(db, "vyron_cost_stock_ledger").slice(ledgerBefore).filter((r) => r.stock_item_id === flourItem().id);
  check("ledger records a GRN Receipt of 10 kg @ 12.35", grnRows.some((r) => r.movement_type === "GRN Receipt" && r.quantity_in === 10 && r.unit_cost === 12.35), JSON.stringify(grnRows.map((r) => [r.movement_type, r.quantity_in, r.unit_cost])));
  check("PO fully received", /Fully Received|Closed/.test(tenantRows(db, "vyron_cost_purchase_orders").find((r) => r.id === po.id).status), tenantRows(db, "vyron_cost_purchase_orders").find((r) => r.id === po.id).status);
  check("procurement stayed inside tenant A", tenantRows(db, "vyron_cost_purchase_orders", B).length === 0 && tenantRows(db, "vyron_cost_goods_receipts", B).length === 0 && Object.entries(B_ROWS).every(([t, rows]) => JSON.stringify(tenantRows(db, t, B)) === JSON.stringify(rows)));
}

/* ======================================================== production run */

section("Production on the imported data (VYRON manufacturing engine)");
{
  const flourBeforeRun = tenantRows(db, "vyron_cost_stock_items").find((r) => r.id === flourStock.id).qty_on_hand;
  const run = await manufacturing.createProductionRun(db, A, { bom_id: bom.id, planned_qty: 2, created_by: "qa" });
  check("run planned from the imported BOM", run?.status === "Planned");
  await manufacturing.transitionProductionRun(db, A, run.id, "start", "qa");
  await manufacturing.completeProductionRun(db, A, run.id, { actual_qty: 2, completed_by: "qa" });
  const item = (id) => tenantRows(db, "vyron_cost_stock_items").find((r) => r.id === id);
  check("flour consumed: exactly 2 × 0.25 = 0.5 kg", Math.abs(item(flourStock.id).qty_on_hand - (flourBeforeRun - 0.5)) < 1e-9, `${flourBeforeRun} → ${item(flourStock.id).qty_on_hand}`);
  const bagStock = tenantRows(db, "vyron_cost_stock_items").find((r) => r.entity_id === bag.id);
  check("bags consumed: 50 − 2 = 48", bagStock.qty_on_hand === 48, String(bagStock.qty_on_hand));
  const fg = tenantRows(db, "vyron_cost_stock_items").find((r) => r.entity_type === "finished_goods" && r.entity_id === loaf.id);
  check("2 loaves received into finished goods", fg.qty_on_hand === 2, String(fg.qty_on_hand));
  const ledger = tenantRows(db, "vyron_cost_stock_ledger");
  const consumed = ledger.filter((r) => r.movement_type === "Production Consumption");
  check("ledger records consumption of each component", consumed.some((r) => r.stock_item_id === flourStock.id) && consumed.some((r) => r.stock_item_id === bagStock.id), JSON.stringify(consumed.map((r) => r.stock_item_id)));
  const fgReceipt = ledger.find((r) => r.stock_item_id === fg.id && Number(r.quantity_in) === 2);
  const tracesToRun = fgReceipt && (JSON.stringify(fgReceipt).includes(run.id) || JSON.stringify(fgReceipt).includes(String(run.run_number)));
  // VYRON posts the finished-goods receipt through an inventory Receipt, whose ledger movement type is "Purchase".
  check("finished-goods receipt is in the ledger and traces back to the run", Boolean(fgReceipt) && Boolean(tracesToRun), JSON.stringify(fgReceipt));
  check("production stayed inside tenant A", JSON.stringify(tenantRows(db, "vyron_cost_stock_items", B)) === "[]" && Object.entries(B_ROWS).every(([t, rows]) => JSON.stringify(tenantRows(db, t, B)) === JSON.stringify(rows)));
}

section("A stale source link fails closed (row removed outside this tool)");
{
  const dbS = createFakeSupabase(seed());
  const planS = buildFoodSockPlan(qaSources(), snapshot(dbS, A));
  await executeFoodSockPlan(dbS, planS, { companyId: A, approvedPlanHash: planS.planHash, scope: "all_planned" });
  const loafLink = dbS.tables.vyron_import_source_links.find((l) => l.company_id === A && l.source_key === "product:sku:QA-1");
  // What a developer reset-centre module reset does: the row goes, its link stays.
  dbS.tables.vyron_cost_products = dbS.tables.vyron_cost_products.filter((r) => r.id !== loafLink?.entity_id);
  const productsBefore = tenantRows(dbS, "vyron_cost_products").length;
  const rerun = await executeFoodSockPlan(dbS, planS, { companyId: A, approvedPlanHash: planS.planHash, scope: "all_planned" });
  const loaf = rerun.results.find((r) => r.sourceKey === "product:sku:QA-1");
  check("stale link: the record fails with a reason, not 'already imported'", loaf?.status === "failed" && /no longer exists/.test(loaf.detail || ""), JSON.stringify(loaf));
  check("stale link: nothing is re-created silently", tenantRows(dbS, "vyron_cost_products").length === productsBefore);
  check("stale link: every other record is still recognised, none created", rerun.results.filter((r) => r.sourceKey !== "product:sku:QA-1").every((r) => r.status !== "failed" && r.status !== "created"));
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}.`);
console.log("In-memory database only: this proves the executor's behaviour, not a production import.");
process.exit(failures ? 1 : 0);
