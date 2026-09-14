#!/usr/bin/env node
/**
 * VYRON — BOM finished good to invoice item lookup regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * A Finished Good BOM saved without choosing an existing product was stored
 * with product_id null and no product row behind it. The BOM list showed it,
 * so the member who built it saw it there, but invoices, sales orders and the
 * item lookup sell products, not BOMs. Nobody in the company could put the new
 * finished good on an invoice, and the member trying to invoice was the one
 * who noticed. Nothing about it was user-specific: the lookup is scoped to the
 * company only.
 *
 * WHAT THIS PROVES
 * ----------------
 * The recipes, item lookup and customer invoice routes are imported unmodified
 * and run end to end: permission, company resolution, the BOM save, the lookup
 * query and the invoice save.
 *
 *   1. Member A creates a Finished Good BOM without choosing a product.
 *   2. Member A sees it in the BOM list and in the lookup.
 *   3. Member B of the same company, who cannot build BOMs but can invoice,
 *      finds it in the invoice item lookup.
 *   4. Member B saves an invoice line for it.
 *   5. A member of a different company cannot see it, by browse or by search.
 *   6. Existing BOM products still appear, once.
 *   7. Archived products stay out of an active search; no permission, no items.
 *   8. A Sub-BOM still gets no product and stays out of the lookup.
 *   9. The lookup answers { ok, items, total, reason }.
 *  10. Default page 200, ceiling 1000, and the total reports the true count.
 *  Plus: re-saving never duplicates, an unlinked product of the same name is
 *  adopted rather than duplicated, and existing BOMs with no product can be
 *  linked without re-costing them — inside their own company only.
 *
 * Family A: no database (an in-memory stand-in seeded with disposable QA
 * tenants), no network, no credentials, no writes outside this process.
 *
 *   npm run test:bom-invoice-visibility
 */

import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);
register("./support/document-email-test-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

/* ------------------------------------------------------------------ checks */

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

/* -------------------------------------------------------------------- seed */

const COMPANY_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const COMPANY_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const WS_A = "aaaaaaaa-1111-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-1111-4000-8000-00000000000b";
const ING_A = "aaaaaaaa-2222-4000-8000-000000000001";
const LEGACY_BOM_A = "aaaaaaaa-3333-4000-8000-000000000001";
const LEGACY_PRODUCT_A = "aaaaaaaa-4444-4000-8000-000000000001";
const ARCHIVED_PRODUCT_A = "aaaaaaaa-4444-4000-8000-000000000002";
const LOOSE_PRODUCT_A = "aaaaaaaa-4444-4000-8000-000000000003";
const PRODUCT_B = "bbbbbbbb-4444-4000-8000-000000000001";
const ORPHAN_BOM_A = "aaaaaaaa-3333-4000-8000-000000000002";

const NEW_FG = "QA Tray Bake 500g";

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: COMPANY_A, company_name: "QA Tenant A", package_name: "Professional", default_vat_rate: 15 },
      { id: WS_B, company_id: COMPANY_B, company_name: "QA Tenant B", package_name: "Professional", default_vat_rate: 15 },
    ],
    vyron_contacts: [],
    vyron_cost_ingredients: [
      { id: ING_A, company_id: COMPANY_A, ingredient_name: "QA Flour", category: "Dry", purchase_unit: "kg", purchase_cost: 10 },
    ],
    vyron_cost_products: [
      {
        id: LEGACY_PRODUCT_A, company_id: COMPANY_A, product_name: "QA Legacy Pie 180g", category: "Pies",
        product_category: "Pies", linked_bom_id: LEGACY_BOM_A, selling_price: 30, total_cost: 12, product_status: "Active",
      },
      {
        id: ARCHIVED_PRODUCT_A, company_id: COMPANY_A, product_name: "QA Retired Pie", category: "Pies",
        product_category: "Pies", linked_bom_id: null, selling_price: 30, total_cost: 12, product_status: "Archived",
      },
      {
        id: LOOSE_PRODUCT_A, company_id: COMPANY_A, product_name: "QA Existing Loaf", category: "Bread",
        product_category: "Bread", linked_bom_id: null, selling_price: 20, total_cost: 8, product_status: "Active",
      },
      {
        id: PRODUCT_B, company_id: COMPANY_B, product_name: "QA Tenant B Pie", category: "Pies",
        product_category: "Pies", linked_bom_id: null, selling_price: 25, total_cost: 10, product_status: "Active",
      },
    ],
    vyron_cost_boms: [
      {
        id: LEGACY_BOM_A, company_id: COMPANY_A, bom_name: "QA Legacy Pie 180g", category: "Pies", yield_qty: 1,
        yield_unit: "unit", status: "Approved", bom_purpose: "Finished Good", product_id: LEGACY_PRODUCT_A,
        selling_price: 30, total_cost: 12, cost_per_unit: 12, created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        // Saved before a Finished Good always got a product.
        id: ORPHAN_BOM_A, company_id: COMPANY_A, bom_name: "QA Orphan Relish", category: "Relish", yield_qty: 4,
        yield_unit: "unit", status: "Approved", bom_purpose: "Finished Good", product_id: null,
        selling_price: 40, total_cost: 48.123, cost_per_unit: 12.03075, created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    vyron_cost_bom_lines: [],
    vyron_cost_stock_items: [
      {
        id: "aaaaaaaa-5555-4000-8000-000000000001", company_id: COMPANY_A, item_code: "FG-LEGACY", description: "QA Legacy Pie 180g",
        category: "Pies", entity_type: "finished_goods", entity_id: LEGACY_PRODUCT_A, unit: "unit", current_cost: 12,
        qty_on_hand: 5, is_active: true,
      },
    ],
    vyron_customers: [],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
  };
}

const BOM_BUILDER = { "boms.view": true, "boms.create": true, "boms.edit": true, "products.view": true, "invoices.view": true };
// The invoicing member deliberately cannot build BOMs.
const INVOICER = { "products.view": true, "invoices.view": true, "invoices.create": true };

const memberA = { userId: "qa-user-a", email: "a@qa-tenant-a.test", workspaceId: WS_A, companyId: COMPANY_A, role: "USER", permissions: BOM_BUILDER };
const memberB = { userId: "qa-user-b", email: "b@qa-tenant-a.test", workspaceId: WS_A, companyId: COMPANY_A, role: "PROCUREMENT", permissions: INVOICER };
const outsider = { userId: "qa-user-c", email: "c@qa-tenant-b.test", workspaceId: WS_B, companyId: COMPANY_B, role: "USER", permissions: { ...BOM_BUILDER, ...INVOICER } };

let db;
function as(session) {
  globalThis.__VYRON_DOCUMENT_EMAIL_TEST__ = {
    supabase: db,
    session,
    companyId: session?.companyId || null,
    activeWorkspace: session ? { id: session.workspaceId, companyId: session.companyId, demoMode: false } : null,
  };
}

/* -------------------------------------------------------------- route calls */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const recipesRoute = await importFromRoot("src/app/api/recipes/route.ts");
const recipeRoute = await importFromRoot("src/app/api/recipes/[id]/route.ts");
const lookupRoute = await importFromRoot("src/app/api/item-lookup/search/route.ts");
const invoicesRoute = await importFromRoot("src/app/api/customer-invoices/route.ts");
const recipesData = await importFromRoot("src/lib/vyron-cost-recipes-data.ts");

async function call(handler, url, init, params) {
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const response = params ? await handler(request, { params: Promise.resolve(params) }) : await handler(request);
  return { status: response.status, body: await response.json() };
}
const json = (method, body) => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const saveBom = (body) => call(recipesRoute.POST, "/api/recipes", json("POST", body));
const lookup = (query = "type=finished_goods&status=active&limit=200") => call(lookupRoute.GET, `/api/item-lookup/search?${query}`);
const named = (items, name) => items.filter((item) => item.productName === name);
const productsNamed = (name) => db.tables.vyron_cost_products.filter((row) => row.product_name === name);

const newBomBody = {
  recipe_name: NEW_FG,
  bom_purpose: "Finished Good",
  status: "Approved",
  category: "Bakery",
  yield_qty: 10,
  yield_unit: "unit",
  selling_price: 50,
  target_gp: 40,
  // Exactly what the BOM builder sends when no finished product is chosen.
  product_id: null,
  lines: [{ line_type: "ingredient", ingredient_id: ING_A, line_name: "QA Flour", quantity: 2, unit: "kg", unit_cost: 10 }],
};

/* ------------------------------------------------------------------ run */

db = createFakeSupabase(seed());

console.log("\n1-2. Member A creates a Finished Good BOM and sees it");
as(memberA);
const created = await saveBom(newBomBody);
check("BOM save succeeds", created.status === 200 && created.body.ok === true, JSON.stringify(created.body));
const newBomId = created.body.recipe?.id;
const newBomRow = db.tables.vyron_cost_boms.find((row) => row.id === newBomId);
const newProducts = productsNamed(NEW_FG);
check("a product now exists for the finished good", newProducts.length === 1, `found ${newProducts.length}`);
const newProduct = newProducts[0] || {};
check("the product is in the BOM's own company", newProduct.company_id === COMPANY_A, newProduct.company_id);
check("the product is active", newProduct.product_status === "Active", newProduct.product_status);
check("the product points at the BOM", newProduct.linked_bom_id === newBomId, newProduct.linked_bom_id);
check("the BOM points at the product", Boolean(newBomRow?.product_id) && newBomRow?.product_id === newProduct.id, newBomRow?.product_id);
check("the saved BOM reports its product", created.body.recipe?.product_id === newProduct.id, created.body.recipe?.product_id);
check("the product costs from the BOM (cost per unit)", Math.abs(Number(newProduct.total_cost) - 2) < 1e-9, String(newProduct.total_cost));

const listA = await call(recipesRoute.GET, "/api/recipes");
check("member A sees it in the BOM list", (listA.body.recipes || []).some((r) => r.id === newBomId), JSON.stringify(listA.body).slice(0, 200));
const lookupA = await lookup();
check("member A finds it in the item lookup", named(lookupA.body.items || [], NEW_FG).length === 1);

console.log("\n3-4. Member B of the same company finds it and invoices it");
as(memberB);
const createByB = await saveBom({ ...newBomBody, recipe_name: "QA Not Allowed" });
check("member B cannot build BOMs (authorisation unchanged)", createByB.status === 403, String(createByB.status));
const lookupB = await lookup();
check("member B's lookup succeeds", lookupB.status === 200 && lookupB.body.ok === true, JSON.stringify(lookupB.body).slice(0, 200));
const hitB = named(lookupB.body.items || [], NEW_FG);
check("member B finds the new finished good", hitB.length === 1, `found ${hitB.length}`);
const itemB = hitB[0] || {};
check("it is a finished good", itemB.entityType === "finished_goods", itemB.entityType);
check("it carries the product id", Boolean(newProduct.id) && itemB.entityId === newProduct.id, itemB.entityId);
check("it is marked active", itemB.isActive === true);
const searchB = await lookup("q=tray%20bake&type=finished_goods&status=active&limit=200");
check("member B finds it by typing part of the name", named(searchB.body.items || [], NEW_FG).length === 1);

// What CustomerInvoicesClient.selectItemLookupResult puts on the line.
const invoiceByB = await call(
  invoicesRoute.POST,
  "/api/customer-invoices",
  json("POST", {
    customerName: "QA Customer",
    lines: [{ productId: itemB.entityId || itemB.stockItemId, productName: itemB.productName, quantity: 3, sellingPrice: 50, costPerUnit: itemB.currentCost }],
  })
);
check("member B saves an invoice with it", invoiceByB.status === 200 && invoiceByB.body.ok === true, JSON.stringify(invoiceByB.body).slice(0, 300));
const lineTables = Object.keys(db.tables).filter((name) => /invoice.*line/i.test(name));
const savedLine = lineTables.flatMap((name) => db.tables[name]).find((row) => row.product_id === newProduct.id);
check("the invoice line references the finished good's product", Boolean(savedLine), `line tables: ${lineTables.join(", ")}`);
check("the invoice belongs to the same company", db.tables.vyron_customer_invoices.every((row) => row.company_id === COMPANY_A));

console.log("\n5. A different company cannot see it");
as(outsider);
const lookupC = await lookup();
check("the other company's lookup succeeds", lookupC.status === 200 && lookupC.body.ok === true);
check("the other company does not see the new finished good", named(lookupC.body.items || [], NEW_FG).length === 0);
check("the other company sees no company A items at all", (lookupC.body.items || []).every((item) => item.entityId !== newProduct.id && item.entityId !== LEGACY_PRODUCT_A));
check("the other company still sees its own products", named(lookupC.body.items || [], "QA Tenant B Pie").length === 1);
const searchC = await lookup("q=tray&type=all&status=all&limit=200");
check("searching by name from the other company finds nothing", (searchC.body.items || []).length === 0, JSON.stringify(searchC.body.items));
const listC = await call(recipesRoute.GET, "/api/recipes");
check("the other company does not see the BOM", !(listC.body.recipes || []).some((r) => r.id === newBomId));
const patchByC = await call(recipeRoute.PATCH, `/api/recipes/${newBomId}`, json("PATCH", { product_id: PRODUCT_B }), { id: newBomId });
check("the other company cannot re-save company A's BOM", patchByC.status !== 200 || patchByC.body.ok !== true, String(patchByC.status));

console.log("\n6-8. Existing BOMs, inactive records, authorisation and Sub-BOMs");
as(memberB);
const again = await lookup();
check("an existing BOM's product still appears, once", named(again.body.items || [], "QA Legacy Pie 180g").length === 1);
check("an archived product stays out of an active search", named(again.body.items || [], "QA Retired Pie").length === 0);
const inactive = await lookup("type=finished_goods&status=inactive&limit=200");
check("an archived product is still found when asking for inactive", named(inactive.body.items || [], "QA Retired Pie").length === 1);
as({ ...memberB, permissions: { "invoices.create": true } });
const noView = await lookup();
check("no products.view permission, no items", noView.status === 403 && (noView.body.items || []).length === 0, String(noView.status));
as(null);
const signedOut = await lookup();
check("signed out, no items", signedOut.status === 401 && (signedOut.body.items || []).length === 0, String(signedOut.status));

as(memberA);
const productCountBefore = db.tables.vyron_cost_products.length;
const sub = await saveBom({ ...newBomBody, recipe_name: "QA Glaze", bom_purpose: "Sub-BOM" });
check("a Sub-BOM saves", sub.status === 200 && sub.body.ok === true, JSON.stringify(sub.body).slice(0, 200));
const subRow = db.tables.vyron_cost_boms.find((row) => row.id === sub.body.recipe?.id);
check("a Sub-BOM keeps product_id null", subRow && (subRow.product_id ?? null) === null, subRow?.product_id);
check("a Sub-BOM creates no product", db.tables.vyron_cost_products.length === productCountBefore);
as(memberB);
check("a Sub-BOM stays out of the lookup", named((await lookup("type=all&status=all&limit=200")).body.items || [], "QA Glaze").length === 0);

console.log("\nRe-saving, adopting an existing product, and linking older BOMs");
as(memberA);
const resave = await call(recipeRoute.PATCH, `/api/recipes/${newBomId}`, json("PATCH", { ...newBomBody, product_id: null }), { id: newBomId });
check("re-saving the BOM with no product chosen succeeds", resave.status === 200 && resave.body.ok === true, JSON.stringify(resave.body).slice(0, 200));
check("re-saving keeps the same product", resave.body.recipe?.product_id === newProduct.id, resave.body.recipe?.product_id);
check("re-saving never duplicates the product", productsNamed(NEW_FG).length === 1, `found ${productsNamed(NEW_FG).length}`);

const loaf = await saveBom({ ...newBomBody, recipe_name: "qa existing loaf " });
check("a BOM named like an unlinked product adopts it", loaf.body.recipe?.product_id === LOOSE_PRODUCT_A, loaf.body.recipe?.product_id);
check("adopting does not create a duplicate", db.tables.vyron_cost_products.filter((row) => /qa existing loaf/i.test(row.product_name)).length === 1);
const retired = await saveBom({ ...newBomBody, recipe_name: "QA Retired Pie" });
check("an archived product of the same name is not adopted", retired.body.recipe?.product_id && retired.body.recipe.product_id !== ARCHIVED_PRODUCT_A, retired.body.recipe?.product_id);

const orphanBefore = structuredClone(db.tables.vyron_cost_boms.find((row) => row.id === ORPHAN_BOM_A));
as(memberB);
check("before linking, the older BOM is not invoiceable", named((await lookup()).body.items || [], "QA Orphan Relish").length === 0);
check("linking is refused from another company", (await recipesData.linkMissingFinishedGoodProduct(db, COMPANY_B, ORPHAN_BOM_A)) === null);
check("and wrote nothing", productsNamed("QA Orphan Relish").length === 0);
const linked = await recipesData.linkMissingFinishedGoodProduct(db, COMPANY_A, ORPHAN_BOM_A);
const orphanAfter = db.tables.vyron_cost_boms.find((row) => row.id === ORPHAN_BOM_A);
check("the older BOM is linked to a new product", Boolean(linked?.productId) && orphanAfter.product_id === linked.productId, JSON.stringify(linked));
check("linking does not re-cost the BOM", orphanAfter.total_cost === orphanBefore.total_cost && orphanAfter.cost_per_unit === orphanBefore.cost_per_unit);
check("the linked product costs at the BOM's stored cost per unit", productsNamed("QA Orphan Relish")[0]?.total_cost === orphanBefore.cost_per_unit);
check("after linking, member B finds it in the lookup", named((await lookup()).body.items || [], "QA Orphan Relish").length === 1);
check("linking twice does nothing", (await recipesData.linkMissingFinishedGoodProduct(db, COMPANY_A, ORPHAN_BOM_A)) === null);
check("a Sub-BOM is never linked", (await recipesData.linkMissingFinishedGoodProduct(db, COMPANY_A, sub.body.recipe?.id)) === null);

console.log("\n9-10. Lookup contract and page limits");
as(memberB);
const contract = await lookup();
check("the answer carries ok, items, total and reason", ["ok", "items", "total", "reason"].every((key) => key in contract.body), Object.keys(contract.body).join(","));
check("total is at least the page length", Number(contract.body.total) >= contract.body.items.length);
const one = await lookup("type=finished_goods&status=active&limit=1");
check("limit=1 returns one item and reports the true total", one.body.items.length === 1 && one.body.total > 1, `${one.body.items.length}/${one.body.total}`);
for (let index = 0; index < 1100; index += 1) {
  db.tables.vyron_cost_products.push({
    id: `aaaaaaaa-6666-4000-8000-${String(index).padStart(12, "0")}`, company_id: COMPANY_A,
    product_name: `QA Bulk ${String(index).padStart(4, "0")}`, product_status: "Active", linked_bom_id: null,
  });
}
const byDefault = await lookup("type=finished_goods&status=active");
check("the default page is 200", byDefault.body.items.length === 200, String(byDefault.body.items.length));
const capped = await lookup("type=finished_goods&status=active&limit=5000");
check("the ceiling is 1000", capped.body.items.length === 1000, String(capped.body.items.length));
check("the total reports every match beyond the page", capped.body.total > 1100, String(capped.body.total));
const pageSize = /const PAGE_SIZE = (\d+);/.exec(readFileSync(path.join(ROOT, "src/components/vyron-platform/item-lookup/ItemLookupField.tsx"), "utf8"));
check("the invoice picker still asks for 200", pageSize?.[1] === "200", pageSize?.[1]);

delete globalThis.__VYRON_DOCUMENT_EMAIL_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
