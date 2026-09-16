#!/usr/bin/env node
/**
 * VYRON — Food Sock post-import VALIDATOR regression test.
 *
 * Proves that the re-plan used by `food-sock-migration.mjs --validate` tells a
 * record that is genuinely missing from one already imported, for categories
 * and opening balances as for every other stage — by the executor's own
 * identity rules, never by comparing counts:
 *
 *   empty tenant      → every scope record is reported missing
 *   imported tenant   → every scope record is present, none missing
 *   re-run            → nothing created, still nothing missing
 *   duplicates        → an ambiguous or shared target is reported, never chosen
 *   isolation         → another tenant's rows never count as present
 *   source links      → a balance or BOM is found through its link, or through
 *                       its item or product when the link is gone; a stale
 *                       link is missing
 *
 * Synthetic "QA Pantry" tenants in an in-memory database. No client data, no
 * real database, no network. Family A.
 *
 *   npm run test:food-sock-validate
 */
import { register } from "node:module";

register("./support/migration-hook.mjs", import.meta.url);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const core = await import("../src/lib/data-migration/core.ts");
const { buildFoodSockPlan, emptyTarget } = await import("../src/lib/data-migration/food-sock-plan.ts");
const { executeFoodSockPlan, executionAcknowledgement, selectExecutionItems } = await import("../src/lib/data-migration/food-sock-execute.ts");
const { readFoodSockTarget } = await import("../src/lib/data-migration/food-sock-target.ts");
const { reconcileImportedScope } = await import("../src/lib/data-migration/food-sock-validate.ts");
const { qaFixture } = await import("./support/food-sock-qa-fixture.mjs");
const { A, B, C, qaSources, seed } = qaFixture(core);

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

const run = (db, plan, companyId, scope = "all_planned") =>
  executeFoodSockPlan(db, plan, {
    companyId,
    approvedPlanHash: plan.planHash,
    scope,
    approval: { approver: "QA Approver", acknowledgement: executionAcknowledgement(plan.planHash, companyId, scope) },
  });
const planFor = async (db, companyId) => buildFoodSockPlan(qaSources(), await readFoodSockTarget(db, companyId));
const expectedFor = (companyId) => buildFoodSockPlan(qaSources(), emptyTarget(companyId));
const items = (plan, stage) => plan.stages[stage].items;
const item = (plan, stage, key) => items(plan, stage).find((i) => i.sourceKey === key);
const writable = (plan, stage) => items(plan, stage).filter((i) => i.action === "create" || i.action === "match");
const missingKeys = (rec, stage) => rec.stages[stage].missing.map((m) => m.sourceKey).sort();
const rowCounts = (db) => Object.fromEntries(Object.entries(db.tables).map(([table, rows]) => [table, rows.length]));
const own = (db, table, companyId) => (db.tables[table] || []).filter((row) => row.company_id === companyId);
const FLOUR_BALANCE = "stock:qa flour|qa store";
const BAG_BALANCE = "stock:qa bag|qa store";

/* ============================================================ 1. empty */

section("1. Empty tenant — categories and opening balances are genuinely pending");
{
  const db = createFakeSupabase(seed());
  const plan = await planFor(db, A);
  const rec = reconcileImportedScope(expectedFor(A), plan, "all_planned");
  check("categories are planned as create", writable(plan, "B_categories").length === 3 && writable(plan, "B_categories").every((i) => i.action === "create"));
  check("opening balances are planned as create", writable(plan, "K_opening_stock").length === 2 && writable(plan, "K_opening_stock").every((i) => i.action === "create"));
  check("validator reports every category missing", rec.stages.B_categories.present === 0 && rec.stages.B_categories.missing.length === 3);
  check("validator reports every opening balance missing", rec.stages.K_opening_stock.present === 0 && missingKeys(rec, "K_opening_stock").join() === [BAG_BALANCE, FLOUR_BALANCE].join());
  check("missing records say why", rec.stages.K_opening_stock.missing.every((m) => m.action === "create" && /would create/.test(m.detail)));
  check("the validation fails", rec.ok === false);
  check("an empty tenant plans exactly as emptyTarget does (hash unchanged)", plan.planHash === expectedFor(A).planHash);
}

/* ========================================================= 2. imported */

section("2. Imported tenant — existing categories and opening balances are present");
const db = createFakeSupabase(seed());
const first = await planFor(db, A);
const report = await run(db, first, A);
check("the import itself is clean", report.results.every((r) => r.status === "created") && report.reconciliation.length === 0, JSON.stringify(report.counts));
const replan = await planFor(db, A);
const rec = reconcileImportedScope(expectedFor(A), replan, "all_planned");
check("categories match by the executor's identity (exact name and type)", writable(replan, "B_categories").every((i) => i.action === "match" && i.matchRule === "exact_name"));
check("each category matches its own row", writable(replan, "B_categories").every((i) => own(db, "vyron_cost_categories", A).some((c) => c.id === i.targetId && c.category_name === i.proposed.category_name && c.category_type === i.proposed.category_type)));
check("opening balances match through their source link", writable(replan, "K_opening_stock").every((i) => i.action === "match" && i.matchRule === "source_link"));
check("each balance matches the stock item that holds it", writable(replan, "K_opening_stock").every((i) => own(db, "vyron_cost_stock_ledger", A).some((l) => l.stock_item_id === i.targetId && l.movement_type === "Opening Balance")));
check("validator: every stage fully present", Object.values(rec.stages).every((s) => s.present === s.expected && s.missing.length === 0 && s.collisions.length === 0), JSON.stringify(rec.stages));
check("validator: categories 3 of 3, balances 2 of 2", rec.stages.B_categories.present === 3 && rec.stages.K_opening_stock.present === 2);
check("the validation passes", rec.ok === true);
check("nothing in the re-plan's scope is left to create", Object.values(selectExecutionItems(replan, "all_planned")).flat().every((i) => i.action !== "create"));
check("demo readiness is unchanged by the import", JSON.stringify(replan.demoReadiness) === JSON.stringify(first.demoReadiness));
check("the demo scope still selects the same records", JSON.stringify(Object.fromEntries(Object.entries(selectExecutionItems(replan, "demo")).map(([s, list]) => [s, list.map((i) => i.sourceKey)]))) === JSON.stringify(Object.fromEntries(Object.entries(selectExecutionItems(first, "demo")).map(([s, list]) => [s, list.map((i) => i.sourceKey)]))));
{
  const demoRec = reconcileImportedScope(expectedFor(A), replan, "demo");
  check("demo-scope validation passes too", demoRec.ok === true && demoRec.stages.K_opening_stock.present === 2);
}

/* ============================================================ 3. re-run */

section("3. Re-run — nothing is created and nothing is reported missing");
{
  const before = rowCounts(db);
  const again = await run(db, replan, A);
  check("executing the re-plan creates nothing", again.results.every((r) => r.status === "already_imported" || r.status === "linked_existing"), JSON.stringify(again.counts));
  check("categories are linked to the existing rows", again.results.filter((r) => r.stage === "B_categories").every((r) => r.status === "linked_existing"));
  check("balances are recognised as already imported", again.results.filter((r) => r.stage === "K_opening_stock").every((r) => r.status === "already_imported"));
  check("no table grew except the import-run log", Object.entries(rowCounts(db)).every(([t, c]) => (t === "vyron_import_runs" ? c === before[t] + 1 : c === before[t])));
  const third = await planFor(db, A);
  check("a third plan is identical to the second", third.planHash === replan.planHash);
  check("the validation still passes", reconcileImportedScope(expectedFor(A), third, "all_planned").ok === true);
}

/* ======================================================= 4. duplicates */

section("4. Duplicate protection — ambiguity is reported, never resolved by choice");
{
  const dup = createFakeSupabase(structuredClone(db.tables));
  const original = own(dup, "vyron_cost_categories", A).find((c) => c.category_name === "Raw Stock");
  dup.tables.vyron_cost_categories.push({ ...original, id: "a-dup-category" });
  const plan = await planFor(dup, A);
  const raw = items(plan, "B_categories").find((i) => i.proposed.category_name === "Raw Stock");
  check("two identical categories: an exception, not a match", raw?.action === "exception" && raw.issues.some((i) => i.code === "ambiguous_target"), JSON.stringify(raw));
  const recDup = reconcileImportedScope(expectedFor(A), plan, "all_planned");
  check("validator reports it missing with the reason", recDup.ok === false && recDup.stages.B_categories.missing.some((m) => m.action === "exception" && /ambiguous_target/.test(m.detail)));
  check("the other categories are still present", recDup.stages.B_categories.present === 2);
  const categoriesBefore = own(dup, "vyron_cost_categories", A).length;
  await run(dup, plan, A);
  check("executing it adds no third category", own(dup, "vyron_cost_categories", A).length === categoriesBefore);

  const dupStock = createFakeSupabase(structuredClone(db.tables));
  const flourLink = dupStock.tables.vyron_import_source_links.findIndex((l) => l.company_id === A && l.source_key === FLOUR_BALANCE);
  dupStock.tables.vyron_import_source_links.splice(flourLink, 1);
  const flourItem = own(dupStock, "vyron_cost_stock_items", A).find((s) => s.description === "QA Flour");
  dupStock.tables.vyron_cost_stock_items.push({ ...flourItem, id: "a-dup-stock-item", item_code: "ING-DUPLICATE" });
  const planStock = await planFor(dupStock, A);
  check("two stock items for one item: the balance is an exception", item(planStock, "K_opening_stock", FLOUR_BALANCE)?.action === "exception" && item(planStock, "K_opening_stock", FLOUR_BALANCE).issues.some((i) => i.code === "ambiguous_target"));
  const ledgerBefore = own(dupStock, "vyron_cost_stock_ledger", A).length;
  await run(dupStock, planStock, A);
  check("executing it posts no second balance", own(dupStock, "vyron_cost_stock_ledger", A).length === ledgerBefore);

  const shared = structuredClone(replan);
  const [one, two] = writable(shared, "K_opening_stock");
  two.targetId = one.targetId;
  const recShared = reconcileImportedScope(expectedFor(A), shared, "all_planned");
  check("two scope records on one row are reported as a shared row", recShared.ok === false && recShared.stages.K_opening_stock.collisions.length === 1 && recShared.stages.K_opening_stock.collisions[0].sourceKeys.length === 2);
}

/* ======================================================== 5. isolation */

section("5. Cross-tenant isolation — another tenant's rows never count");
{
  const multi = createFakeSupabase(structuredClone(db.tables));
  const planB = await planFor(multi, B);
  check("tenant B plans its own categories and balances as create", writable(planB, "B_categories").every((i) => i.action === "create") && writable(planB, "K_opening_stock").every((i) => i.action === "create"));
  await run(multi, planB, B);
  check("tenant B's own import is recorded in B only", own(multi, "vyron_cost_categories", B).length === 3 && own(multi, "vyron_cost_stock_ledger", B).length === 2);

  const targetC = await readFoodSockTarget(multi, C);
  check("tenant C's snapshot holds no row of A or B", Object.values(targetC).filter(Array.isArray).every((list) => list.length === 0));
  const planC = buildFoodSockPlan(qaSources(), targetC);
  const recC = reconcileImportedScope(expectedFor(C), planC, "all_planned");
  check("tenant C: nothing is present, everything is missing", Object.values(recC.stages).every((s) => s.present === 0 && s.missing.length === s.expected) && recC.ok === false);

  const targetA = await readFoodSockTarget(multi, A);
  check("tenant A's snapshot holds only A's categories and links", targetA.categories.every((c) => own(multi, "vyron_cost_categories", A).some((r) => r.id === c.id)) && targetA.sourceLinks.length === own(multi, "vyron_import_source_links", A).length);
  check("tenant A's opening balances are A's stock items only", targetA.openingBalanceStockItemIds.every((id) => own(multi, "vyron_cost_stock_items", A).some((s) => s.id === id)));
  const recA = reconcileImportedScope(expectedFor(A), buildFoodSockPlan(qaSources(), targetA), "all_planned");
  check("tenant A still validates, matched to A's rows only", recA.ok === true);
  const planA = buildFoodSockPlan(qaSources(), targetA);
  const bIds = new Set([...own(multi, "vyron_cost_categories", B), ...own(multi, "vyron_cost_stock_items", B)].map((r) => r.id));
  check("no A record matches a B row", [...writable(planA, "B_categories"), ...writable(planA, "K_opening_stock")].every((i) => !bIds.has(i.targetId)));

  const lookalike = createFakeSupabase(seed());
  lookalike.tables.vyron_cost_categories.push({ id: "b-category-raw", company_id: B, category_name: "Raw Stock", category_type: "Ingredient" });
  const planLook = await planFor(lookalike, A);
  check("a same-named category in B leaves A's category to create", item(planLook, "B_categories", "category:Ingredient:raw stock")?.action === "create");
}

/* ===================================================== 6. source links */

section("6. Source-link identity (opening balances, BOMs, categories)");
{
  const noLink = createFakeSupabase(structuredClone(db.tables));
  const index = noLink.tables.vyron_import_source_links.findIndex((l) => l.company_id === A && l.source_key === FLOUR_BALANCE);
  noLink.tables.vyron_import_source_links.splice(index, 1);
  const plan = await planFor(noLink, A);
  const flour = item(plan, "K_opening_stock", FLOUR_BALANCE);
  check("link gone, balance present: found through the item's own link", flour?.action === "match" && flour.matchRule === "existing_opening_balance");
  check("…and it is the same stock item", flour?.targetId === item(replan, "K_opening_stock", FLOUR_BALANCE).targetId);
  check("the validation passes", reconcileImportedScope(expectedFor(A), plan, "all_planned").ok === true);
  const resumed = await run(noLink, plan, A);
  check("executing it re-links without posting again", resumed.results.find((r) => r.sourceKey === FLOUR_BALANCE)?.status === "linked_existing" && own(noLink, "vyron_cost_stock_ledger", A).length === 2);
  check("the link is restored", own(noLink, "vyron_import_source_links", A).some((l) => l.source_key === FLOUR_BALANCE));

  const stale = createFakeSupabase(structuredClone(db.tables));
  const bagLink = own(stale, "vyron_import_source_links", A).find((l) => l.source_key === BAG_BALANCE);
  stale.tables.vyron_cost_stock_ledger = stale.tables.vyron_cost_stock_ledger.filter((l) => !(l.company_id === A && l.stock_item_id === bagLink.entity_id));
  const planStale = await planFor(stale, A);
  check("link kept, balance removed: not reported present", item(planStale, "K_opening_stock", BAG_BALANCE)?.action === "create");
  const recStale = reconcileImportedScope(expectedFor(A), planStale, "all_planned");
  check("validator reports exactly that balance missing", recStale.ok === false && missingKeys(recStale, "K_opening_stock").join() === BAG_BALANCE && recStale.stages.K_opening_stock.present === 1);
  const staleRun = await run(stale, planStale, A);
  const bag = staleRun.results.find((r) => r.sourceKey === BAG_BALANCE);
  check("the executor fails it closed, posting nothing", bag?.status === "failed" && /no longer exists/.test(bag.detail || "") && !own(stale, "vyron_cost_stock_ledger", A).some((l) => l.stock_item_id === bagLink.entity_id));

  const foreign = createFakeSupabase(structuredClone(db.tables));
  for (const link of foreign.tables.vyron_import_source_links) if (link.company_id === A && link.source_key === FLOUR_BALANCE) link.company_id = B;
  const planForeign = await planFor(foreign, A);
  check("a link belonging to another tenant is not A's identity", item(planForeign, "K_opening_stock", FLOUR_BALANCE)?.matchRule === "existing_opening_balance");

  const LOAF_BOM = "bom:sku:QA-1|name:qa loaf";
  check("BOMs match through their source link, to their own row", writable(replan, "I_boms").every((i) => i.action === "match" && i.matchRule === "source_link" && own(db, "vyron_cost_boms", A).some((b) => b.id === i.targetId)));
  const bomNoLink = createFakeSupabase(structuredClone(db.tables));
  bomNoLink.tables.vyron_import_source_links = bomNoLink.tables.vyron_import_source_links.filter((l) => !(l.company_id === A && l.source_key === LOAF_BOM));
  const planBom = await planFor(bomNoLink, A);
  check("BOM link gone: found as the one BOM of its linked product", item(planBom, "I_boms", LOAF_BOM)?.matchRule === "existing_product_bom" && item(planBom, "I_boms", LOAF_BOM)?.targetId === item(replan, "I_boms", LOAF_BOM).targetId);
  check("…and the validation passes", reconcileImportedScope(expectedFor(A), planBom, "all_planned").ok === true);
  const bomStale = createFakeSupabase(structuredClone(db.tables));
  const loafBomId = item(replan, "I_boms", LOAF_BOM).targetId;
  bomStale.tables.vyron_cost_boms = bomStale.tables.vyron_cost_boms.filter((b) => b.id !== loafBomId);
  const planBomStale = await planFor(bomStale, A);
  check("BOM removed, link kept: reported missing, not present", item(planBomStale, "I_boms", LOAF_BOM)?.action === "create" && missingKeys(reconcileImportedScope(expectedFor(A), planBomStale, "all_planned"), "I_boms").join() === LOAF_BOM);
  const bomDup = createFakeSupabase(structuredClone(bomNoLink.tables));
  bomDup.tables.vyron_cost_boms.push({ ...own(bomDup, "vyron_cost_boms", A).find((b) => b.id === loafBomId), id: "a-dup-bom" });
  check("two BOMs for one product: an exception, not a choice", item(await planFor(bomDup, A), "I_boms", LOAF_BOM)?.action === "exception");

  const renamed = createFakeSupabase(structuredClone(db.tables));
  for (const c of renamed.tables.vyron_cost_categories) if (c.company_id === A && c.category_name === "Raw Stock") c.category_name = "raw stock";
  const planRenamed = await planFor(renamed, A);
  check("category identity is exact, as in the executor (case differs → create)", item(planRenamed, "B_categories", "category:Ingredient:raw stock")?.action === "create");
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}.`);
console.log("In-memory database only: this proves the validator's behaviour, not a production validation.");
process.exit(failures ? 1 : 0);
