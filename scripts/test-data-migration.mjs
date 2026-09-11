#!/usr/bin/env node
/**
 * VYRON — controlled data-migration regression test.
 *
 * Proves the rules the Food Sock Meals import (and any later client import
 * built on src/lib/data-migration) must never break: exact identity only,
 * ambiguity refused, TBC preserved, blanks never overwrite, negative stock
 * never posted, unknown costs never valued at zero, copies and bundles kept
 * apart, historical purchase orders never made live, unit conversion exact,
 * re-runs idempotent, output deterministic.
 *
 * Every fixture here is SYNTHETIC — a disposable "QA Pantry" tenant invented
 * for the test. No client file is read, no database is touched, no network is
 * used. Family A.
 *
 *   npm run test:data-migration
 */
import { register } from "node:module";

register("./support/migration-hook.mjs", import.meta.url);

const core = await import("../src/lib/data-migration/core.ts");
const { readCsvTable, parseCsv, decodeCsvBytes } = await import("../src/lib/data-migration/csv.ts");
const { buildFoodSockPlan, emptyTarget } = await import("../src/lib/data-migration/food-sock-plan.ts");
const { gtinIssue } = await import("../src/lib/data-migration/food-sock-sources.ts");

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
const n = (raw) => core.parseSourceNumber(raw);

/* ================================================================== core */

section("Normalisation keeps identity-bearing words");
check("NBSP and double spaces collapse", core.normalizeName("QA  Branded cooler bag ") === "qa branded cooler bag");
check("typographic dash becomes plain", core.normalizeName("Meal Box – 1") === core.normalizeName("Meal Box - 1"));
check("'Half' survives", core.normalizeName("Chicken Pasta Half") !== core.normalizeName("Chicken Pasta"));
check("'Copy' survives", core.normalizeName("Loaf - Copy") !== core.normalizeName("Loaf"));
check("SKU normalisation is presentation only", core.normalizeSku(" qa-1 ") === "QA-1" && core.normalizeSku("10AB&C") === "10AB&C");

section("TBC, blank and invalid values are classified, never coerced");
check("TBC stays TBC", n("TBC").kind === "tbc" && n("tbc — supplier needed").kind === "tbc");
check("blank stays blank", n("").kind === "blank" && n("   ").kind === "blank");
check("dash is invalid, not zero", n("–").kind === "invalid");
check("currency text parses exactly", n("R 1,234.50").kind === "number" && n("R 1,234.50").value === 1234.5);
check("zero is a number (callers decide it means unknown)", n("0.00000").kind === "number" && n("0.00000").value === 0);

section("Exact decimal scaling (no floating point)");
const scale = core.scaleDecimal;
const scaleCases = [["0.09391", 3, "93.91"], ["0.00378", 3, "3.78"], ["13964.22000", -3, "13.96422"], ["4.7", -3, "0.0047"], ["159.0000", -3, "0.159"], ["4411.25600", -3, "4.411256"], ["-10.00000", -3, "-0.01"], ["0", 3, "0"], ["0.0416666667", 3, "41.6666667"]];
for (const [raw, exp, expected] of scaleCases) check(`scaleDecimal(${raw}, ${exp}) = ${expected}`, scale(raw, exp) === expected, scale(raw, exp));
check("decimalPlaces ignores trailing zeros", core.decimalPlaces("13.96420") === 4 && core.decimalPlaces("12") === 0);
let threw = false;
try { scale("1e-5", 3); } catch { threw = true; }
check("scaleDecimal refuses non-plain input", threw);

section("Identity ladder — exact rungs only, ambiguity refused");
const candidates = [
  { id: "t1", sku: "QA-1", name: "QA Loaf" },
  { id: "t2", sku: null, name: "QA Flour" },
  { id: "t3", sku: null, name: "QA Salt" },
  { id: "t4", sku: null, name: "QA Salt" },
];
const m = core.matchEntity;
check("source link wins over everything", m({ sourceKey: "k", sku: "QA-1", name: "QA Loaf" }, candidates, { sourceLinks: new Map([["k", "t9"]]) }).targetId === "t9");
check("exact SKU", m({ sourceKey: "a", sku: "QA-1", name: "anything" }, candidates).rule === "exact_sku");
check("normalised SKU", m({ sourceKey: "a", sku: " qa-1 " }, candidates).rule === "normalized_sku");
check("normalised name", m({ sourceKey: "a", name: "  qa   flour " }, candidates).rule === "normalized_name");
check("approved alias only when approved", m({ sourceKey: "a", name: "Cake Flour" }, candidates, { approvedAliases: new Map([["cake flour", "t2"]]) }).rule === "approved_alias" && m({ sourceKey: "a", name: "Cake Flour" }, candidates).status === "none");
const amb = m({ sourceKey: "a", name: "QA Salt" }, candidates);
check("two candidates at one rung is ambiguous, not a choice", amb.status === "ambiguous" && amb.targetIds.join() === "t3,t4");
check("near-miss name does not match (no fuzzy)", m({ sourceKey: "a", name: "QA Flourr" }, candidates).status === "none");

section("Blank never overwrites; TBC never replaces a number");
const changes = core.diffFields({ email: "a@x.test", cost: "12.5", phone: "1" }, { email: "", cost: "TBC", phone: "2" });
check("only the real change survives", changes.length === 1 && changes[0].field === "phone", JSON.stringify(changes));

section("Stable hashing");
check("key order does not change the hash", core.stableHash({ a: 1, b: [1, { c: 2, d: 3 }] }) === core.stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }));

/* =================================================================== csv */

section("CSV reader keeps identity intact");
const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('"ProductName","SKU"\r\n"QA, Loaf ""big""","123456789012"\r\n"Multi\nline","0012"\r\n')]);
const table = readCsvTable(bom);
check("byte-order mark stripped, first header intact", table.header[0] === "ProductName" && table.hadByteOrderMark);
check("quoted comma and doubled quote", table.records[0].values.ProductName === 'QA, Loaf "big"');
check("12-digit SKU exact", table.records[0].values.SKU === "123456789012");
check("leading zeros kept", table.records[1].values.SKU === "0012");
check("embedded newline and source row numbers", table.records[1].values.ProductName === "Multi\nline" && table.records[1].row === 3);
check("short rows are reported", readCsvTable(new TextEncoder().encode("a,b,c\n1,2\n")).malformedRows.join() === "2");
check("non-UTF-8 is decoded as Windows-1252 and reported", decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9])).encoding === "windows-1252");
check("parseCsv handles CRLF and trailing newline", JSON.stringify(parseCsv("a,b\r\n1,2\r\n")) === JSON.stringify([["a", "b"], ["1", "2"]]));

section("GS1 check digits");
check("valid GTIN-13", gtinIssue("2000000000008") === null);
check("wrong check digit reported", /check digit/.test(gtinIssue("2000000000009") || ""));
check("wrong length reported", /digits/.test(gtinIssue("12345") || ""));

/* ======================================================= plan fixtures */

const FILE = (key, name) => ({ key, name, sha256: `sha-${key}`, bytes: 1 });
const ref = (file, row, sheet) => ({ system: "qa", file, fileSha256: `sha-${file}`, ...(sheet ? { sheet } : {}), row });
const product = (row, over) => ({
  ref: ref("products.csv", row),
  name: "",
  sku: "",
  category: "Raw Stock",
  itemType: "Stocked product",
  description: "",
  uom: "grams",
  purchasingUom: "kg's",
  purchasingRatio: n("1000.0000"),
  cost: n(""),
  defaultPrice: n(""),
  taxInclusivePrice: false,
  lastVendor: "",
  barcode: "",
  isActive: true,
  autoManufacture: false,
  weight: n(""),
  remarks: "",
  ...over,
});
const bomLine = (row, finishedName, finishedSku, componentName, quantity, over = {}) => ({ ref: ref("bom.csv", row), finishedName, finishedSku, componentName, componentSku: "", quantity: n(quantity), uom: "", isActive: true, ...over });
const po = (row, orderNumber, vendor, productName, price, over = {}) => ({
  ref: ref("po.csv", row),
  orderNumber,
  inventoryStatus: "Fulfilled",
  paymentStatus: "Paid",
  vendor,
  orderDate: "2026/08/01 10:00:00 +00:00",
  dueDate: "",
  isCancelled: false,
  isQuote: false,
  productName,
  sku: "",
  quantity: n("10"),
  uom: "kg's",
  unitPrice: n(price),
  taxName: "VAT",
  taxRate: n("15"),
  ...over,
});

function qaSources() {
  return {
    files: [FILE("products", "products.csv"), { ...FILE("contacts", "contacts.csv"), headerWidth: 73, rowWidths: { 53: 2 } }],
    vendors: [
      { ref: ref("vendors.csv", 2), name: "QA Mills", contactName: "Pat", email: "pat@qa-mills.test", phone: "", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" },
      { ref: ref("vendors.csv", 3), name: "Test Vendor", contactName: "", email: "", phone: "", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" },
      { ref: ref("vendors.csv", 4), name: "Twin Supply", contactName: "", email: "", phone: "", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" },
      { ref: ref("vendors.csv", 5), name: "Twin  Supply ", contactName: "", email: "", phone: "", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" },
      { ref: ref("vendors.csv", 6), name: "Stock adjustments to use", contactName: "", email: "", phone: "", paymentTerms: "", currency: "ZAR", taxInclusivePricing: false, isActive: true, remarks: "" },
    ],
    products: [
      product(2, { name: "QA Flour", cost: n("0.01235"), lastVendor: "QA Mills" }),
      product(3, { name: "QA Salt", cost: n("TBC") }),
      product(4, { name: "QA Yeast", cost: n("0.00000") }),
      product(5, { name: "QA Bag", category: "Bags", uom: "Bags", purchasingUom: "Bags", purchasingRatio: n("1"), cost: n("2.03") }),
      product(6, { name: "QA Loaf", sku: "QA-1", category: "Meal for 4", uom: "Loaves", purchasingUom: "Loaves", purchasingRatio: n("1"), cost: n("3.5"), defaultPrice: n("20.00") }),
      product(7, { name: "QA Loaf Half", category: "Default Category", uom: "Loaves", purchasingRatio: n("1"), defaultPrice: n("") }),
      product(8, { name: "QA Box", sku: "QA-BOX", category: "Buckets", uom: "Boxes", purchasingRatio: n("1"), defaultPrice: n("100") }),
      product(9, { name: "Test", category: "Default Category", uom: "" }),
      product(10, { name: "QA Twin", sku: "QA-TWIN", category: "Raw Stock", cost: n("0.01") }),
      product(11, { name: "QA Twin B", sku: "qa-twin", category: "Raw Stock", cost: n("0.01") }),
      product(12, { name: "QA Roll", sku: "QA-ROLL", category: "Meal for 4", uom: "Rolls", purchasingUom: "Rolls", purchasingRatio: n("1"), defaultPrice: n("5") }),
      product(13, { name: "QA Pail", category: "Buckets", uom: "", purchasingUom: "", purchasingRatio: n("1"), cost: n("24.89") }),
      product(14, { name: "QA Tub", sku: "QA-TUB", category: "Buckets", uom: "", purchasingUom: "", purchasingRatio: n("1"), defaultPrice: n("50") }),
    ],
    bomLines: [
      bomLine(2, "QA Loaf", "QA-1", "QA Flour", "250.0000"),
      bomLine(3, "QA Loaf", "QA-1", "QA Bag", "1.0000", { uom: "Bag" }),
      bomLine(4, "QA Loaf", "QA-1", "QA Yeast", "3", { isActive: false }),
      bomLine(5, "QA Loaf - Copy", "", "QA Flour", "250"),
      bomLine(6, "QA Loaf Half", "", "QA Flour", "TBC"),
      bomLine(7, "QA Box", "QA-BOX", "QA Loaf", "4"),
      bomLine(8, "QA Mystery", "QA-1", "QA Flour", "1"),
      bomLine(9, "QA Box", "QA-BOX", "QA Unknown Thing", "1"),
      bomLine(10, "QA Roll", "QA-ROLL", "QA Salt", "5"),
      bomLine(11, "QA Roll", "QA-ROLL", "QA Pail", "1"),
    ],
    stockLevels: [
      { ref: ref("stock.csv", 2), name: "QA Flour", sku: "", location: "QA Store", quantity: n("12345.678") },
      { ref: ref("stock.csv", 3), name: "QA Bag", sku: "", location: "QA Store", quantity: n("5.00000") },
      { ref: ref("stock.csv", 4), name: "Test", sku: "", location: "QA Store", quantity: n("-7.00000") },
      { ref: ref("stock.csv", 5), name: "QA Salt", sku: "", location: "QA Store", quantity: n("100") },
      { ref: ref("stock.csv", 6), name: "QA Yeast", sku: "", location: "QA Store", quantity: n("0") },
      { ref: ref("stock.csv", 7), name: "QA Ghost", sku: "", location: "QA Store", quantity: n("3") },
    ],
    purchaseOrderLines: [
      po(2, "PO-1", "QA Mills", "QA Flour", "12.35000"),
      po(3, "PO-2", "Stock adjustments to use", "QA Flour", "99.00000", { orderDate: "2026/09/01 10:00:00 +00:00" }),
      po(4, "PO-3", "QA Mills", "QA Flour", "12.00000", { inventoryStatus: "Started", paymentStatus: "Unpaid", orderDate: "2026/07/01 10:00:00 +00:00" }),
      po(5, "PO-4", "QA Mills", "QA Flour", "12.00000", { inventoryStatus: "Started", isCancelled: true }),
      po(6, "PO-5", "QA Mills", "QA Bag", "2.03000", { uom: "Bags" }),
    ],
    images: [
      { ref: ref("images.csv", 2), name: "QA Loaf", sku: "QA-1", url: "https://example.test/a.png" },
      { ref: ref("images.csv", 3), name: "Nobody", sku: "", url: "https://example.test/b.png" },
    ],
    barcodes: [
      { ref: ref("gs1.xlsx", 3, "Sheet1"), productType: "Base", gtin: "2000000000008", gtinIssue: null, brand: "QA", functionalName: "Loaf", variant: "", netContent: n("400"), uom: "Gram" },
      { ref: ref("gs1.xlsx", 4, "Sheet1"), productType: "Base", gtin: "2000000000009", gtinIssue: "GTIN check digit is 9; GS1 requires 8.", brand: "QA", functionalName: "Loaf", variant: "", netContent: n("400"), uom: "Gram" },
    ],
    costReference: [],
    workbookBomCosts: [],
    productRange: [{ ref: ref("range.xlsx", 5, "Product Range"), category: "Box", product: "QA Box", sku: "QA-BOX", totalSold: n("1"), totalRevenue: n("100") }],
    contacts: [{ ref: ref("contacts.csv", 2), name: "Jane Buyer" }, { ref: ref("contacts.csv", 3), name: "Jane Buyer" }],
    discontinuedNames: [],
  };
}

const find = (plan, stage, key) => plan.stages[stage].items.find((i) => i.sourceKey === key);
const codes = (item) => (item ? item.issues.map((i) => i.code) : []);

/* ================================================================ plan */

const plan = buildFoodSockPlan(qaSources());

section("Tenant: nothing is written without an approved tenant");
check("missing tenant is an exception", find(plan, "A_tenant", "tenant").action === "exception");

section("Suppliers");
check("real supplier created", find(plan, "C_suppliers", "vendor:qa mills").action === "create");
check("pseudo vendor skipped with its reason", find(plan, "C_suppliers", "vendor:test vendor").classification === "pseudo_vendor");
check("duplicate vendor names are exceptions, not merged", plan.stages.C_suppliers.items.filter((i) => i.sourceKey === "vendor:twin supply").every((i) => i.action === "exception") && plan.stages.C_suppliers.items.filter((i) => i.sourceKey === "vendor:twin supply").length === 2);

section("Customers are deferred, never guessed from a broken export");
check("every contact skipped", plan.stages.D_customers.items.every((i) => i.action === "skip"));
check("duplicate contact names flagged", plan.stages.D_customers.items.every((i) => i.classification === "deferred_duplicate_name"));

section("Stock items, units and TBC");
const flour = find(plan, "E_stock_items", "product:name:qa flour");
check("raw material created", flour.action === "create" && flour.classification === "raw_material");
check("grams → kg by the source ratio, cost exact", flour.proposed.unit === "kg" && flour.proposed.cost_per_unit === 12.35 && flour.proposed.source_cost === "0.01235");
check("supplier linked by exact name", flour.proposed.supplier_key === "vendor:qa mills");
const salt = find(plan, "E_stock_items", "product:name:qa salt");
check("TBC cost stays unresolved, never zero", salt.proposed.cost_per_unit === null && codes(salt).includes("cost_unresolved"));
check("an item whose cost is unknown is not written (VYRON would store 0)", salt.action === "exception" && codes(salt).includes("cost_unresolved_not_written"));
const yeast = find(plan, "E_stock_items", "product:name:qa yeast");
check("zero cost is unknown, not free", yeast.proposed.cost_per_unit === null && yeast.issues.some((i) => i.severity === "unresolved") && yeast.action === "exception");
check("a 'Buckets' item a BOM consumes is packaging", find(plan, "E_stock_items", "product:name:qa pail").classification === "packaging");
check("a sold 'Buckets' item nothing makes or consumes is a finished good without BOM", find(plan, "F_finished_goods", "product:sku:QA-TUB").classification === "finished_no_bom");
check("non-inventory 'Test' is not a stock item", find(plan, "E_stock_items", "product:name:test").action === "skip");
check("duplicate SKU identity is an exception for both rows", plan.stages.E_stock_items.items.filter((i) => i.sourceKey === "product:sku:QA-TWIN").every((i) => i.action === "exception"));

section("Cost evidence");
check("inFlow cost confirmed by the latest genuine purchase", find(plan, "J_supplier_costs", "cost:name:qa flour").classification === "po_confirmed");
const flourEvidence = find(plan, "J_supplier_costs", "cost:name:qa flour").proposed;
check("pseudo-vendor 'purchase' is not cost evidence", flourEvidence.latestPurchase.orderNumber === "PO-1");
check("cancelled order is not cost evidence", flourEvidence.latestPurchase.orderNumber !== "PO-4");

section("Finished goods");
const loaf = find(plan, "F_finished_goods", "product:sku:QA-1");
check("made product is a finished good", loaf.action === "create" && loaf.classification === "finished_good");
check("price basis taken from the source flag", loaf.proposed.selling_price === 20 && loaf.proposed.price_basis === "excl_vat");
const half = find(plan, "F_finished_goods", "product:name:qa loaf half");
check("half variant kept as its own product, price unresolved", half.proposed.variant === "half_variant" && codes(half).includes("price_unresolved"));
check("a product with no price is not written (VYRON would store 0)", half.action === "exception" && codes(half).includes("price_unresolved_not_written"));
check("its BOM is therefore not written either", find(plan, "I_boms", "bom:name:qa loaf half").action === "exception");

section("BOMs");
const loafBom = find(plan, "I_boms", "bom:sku:QA-1|name:qa loaf");
check("complete BOM planned", loafBom.action === "create");
const flourLine = loafBom.proposed.lines.find((l) => l.component_name === "QA Flour");
check("BOM quantity converted exactly (250 g → 0.25 kg)", flourLine.quantity === 0.25 && flourLine.unit === "kg" && flourLine.source_quantity === "250.0000");
check("inactive line excluded and reported", loafBom.proposed.lines.length === 2 && codes(loafBom).includes("inactive_lines_excluded"));
check("unit text difference warned, not converted", codes(loafBom).includes("unit_text_differs"));
check("computed cost = 0.25 × 12.35 + 1 × 2.03", Math.abs(loafBom.proposed.computed_cost - 5.1175) < 1e-9, String(loafBom.proposed.computed_cost));
const copy = find(plan, "I_boms", "bom:name:qa loaf - copy");
check("copy BOM is not merged into the original", copy.action === "exception" && copy.classification === "copy_variant");
const halfBom = find(plan, "I_boms", "bom:name:qa loaf half");
check("TBC BOM quantity stays unresolved", codes(halfBom).includes("quantity_tbc") && halfBom.proposed.lines[0].quantity === null);
const box = find(plan, "I_boms", "bom:sku:QA-BOX|name:qa box");
check("bundle of finished goods is refused", box.action === "exception" && codes(box).includes("bundle_bom"));
check("unknown component blocks the BOM", codes(box).includes("component_none"));
const roll = find(plan, "I_boms", "bom:sku:QA-ROLL|name:qa roll");
check("a BOM needing an unresolved-cost component is not written", roll.action === "exception" && codes(roll).includes("component_not_planned"));
const mystery = find(plan, "I_boms", "bom:sku:QA-1|name:qa mystery");
check("SKU that belongs to another name is a conflict", mystery.action === "exception" && codes(mystery).includes("finished_conflict"));

section("Barcodes and images");
check("valid GTIN with no carrier is an exception (no description matching)", find(plan, "G_barcodes", "gtin:2000000000008").action === "exception");
check("bad check digit is an exception", codes(find(plan, "G_barcodes", "gtin:2000000000009")).includes("gtin_invalid"));
check("image associated by exact SKU, deferred", find(plan, "H_images", "image:row:2").classification === "deferred_no_image_field");
check("image for an unknown product is an exception", find(plan, "H_images", "image:row:3").action === "exception");

section("Opening stock");
const flourStock = find(plan, "K_opening_stock", "stock:qa flour|qa store");
check("positive stock planned in kg", flourStock.action === "create" && flourStock.proposed.quantity === 12.345678 && flourStock.proposed.unit === "kg");
check("precision loss beyond 4 decimals is reported", codes(flourStock).includes("precision_stock_quantity"));
check("negative stock never becomes a movement", codes(find(plan, "K_opening_stock", "stock:test|qa store")).includes("negative_stock") && find(plan, "K_opening_stock", "stock:test|qa store").action === "exception");
check("unresolved cost blocks the balance (not posted at zero)", find(plan, "K_opening_stock", "stock:qa salt|qa store").action === "exception");
check("zero stock skipped", find(plan, "K_opening_stock", "stock:qa yeast|qa store").action === "skip");
check("unknown stock item is an exception", find(plan, "K_opening_stock", "stock:qa ghost|qa store").action === "exception");

section("Purchase orders");
check("genuinely outstanding order held for review, not made live", find(plan, "L_open_purchase_orders", "po:PO-3").action === "exception");
check("fulfilled order is historical", find(plan, "M_historical_purchase_orders", "po:PO-1").classification === "historical_fulfilled");
check("cancelled order is historical", find(plan, "M_historical_purchase_orders", "po:PO-4").classification === "historical_cancelled");
check("pseudo-vendor order flagged", codes(find(plan, "M_historical_purchase_orders", "po:PO-2")).includes("pseudo_vendor_order"));

section("Demo readiness is a classification, not a repair");
const ready = plan.demoReadiness.find((d) => d.productKey === "sku:QA-1");
check("QA Loaf is demo-ready", ready?.ready === true, JSON.stringify(ready?.reasons));
check("half variant is not demo-ready", plan.demoReadiness.find((d) => d.productKey === "name:qa loaf half")?.ready === false);
const short = qaSources();
short.stockLevels[0].quantity = n("100");
check("insufficient component stock blocks readiness", buildFoodSockPlan(short).demoReadiness.find((d) => d.productKey === "sku:QA-1")?.ready === false);
const conflict = qaSources();
conflict.productRange.push({ ref: ref("range.xlsx", 6, "Product Range"), category: "Loaf", product: "QA Loaf", sku: "QA-01", totalSold: n("1"), totalRevenue: n("1") });
const conflictPlan = buildFoodSockPlan(conflict);
check("SKU disagreeing across sources blocks readiness", conflictPlan.demoReadiness.find((d) => d.productKey === "sku:QA-1")?.ready === false);

section("Determinism and idempotency");
const shuffled = qaSources();
for (const key of ["vendors", "products", "bomLines", "stockLevels", "purchaseOrderLines", "images"]) shuffled[key].reverse();
check("same sources in a different order → same plan hash", buildFoodSockPlan(shuffled).planHash === plan.planHash);
check("rebuilding gives the same hash", buildFoodSockPlan(qaSources()).planHash === plan.planHash);

const target = emptyTarget("00000000-0000-4000-8000-00000000aaaa");
target.sourceLinks = [
  { source_system: "inflow", source_entity: "vendor", source_key: "vendor:qa mills", entity_type: "supplier", entity_id: "s-1" },
  { source_system: "inflow", source_entity: "product", source_key: "product:name:qa flour", entity_type: "ingredient", entity_id: "i-1" },
  { source_system: "inflow", source_entity: "product", source_key: "product:sku:QA-1", entity_type: "product", entity_id: "p-1" },
];
const rerun = buildFoodSockPlan(qaSources(), target);
check("re-run matches previously imported supplier via source link", find(rerun, "C_suppliers", "vendor:qa mills").action === "match" && find(rerun, "C_suppliers", "vendor:qa mills").matchRule === "source_link");
check("re-run matches previously imported stock item", find(rerun, "E_stock_items", "product:name:qa flour").targetId === "i-1");
check("re-run matches previously imported product", find(rerun, "F_finished_goods", "product:sku:QA-1").targetId === "p-1");
check("tenant known on re-run", find(rerun, "A_tenant", "tenant").action === "match");
const byName = emptyTarget("00000000-0000-4000-8000-00000000aaaa");
byName.suppliers = [{ id: "s-2", supplier_name: "QA  MILLS" }, { id: "s-3", supplier_name: "Other" }];
check("existing supplier matched by exact normalised name, not duplicated", find(buildFoodSockPlan(qaSources(), byName), "C_suppliers", "vendor:qa mills").targetId === "s-2");
const twoSame = emptyTarget("00000000-0000-4000-8000-00000000aaaa");
twoSame.suppliers = [{ id: "s-2", supplier_name: "QA Mills" }, { id: "s-4", supplier_name: "qa mills" }];
check("two existing candidates → exception, never a pick", find(buildFoodSockPlan(qaSources(), twoSame), "C_suppliers", "vendor:qa mills").action === "exception");

section("Exact decimal arithmetic (expected results)");
check("add", core.addDecimal("0.12345", "7") === "7.12345");
check("subtract", core.subtractDecimal("7.12345", "0.125") === "6.99845");
check("multiply", core.multiplyDecimal("0.0125", "10") === "0.125" && core.multiplyDecimal("0.0033", "10") === "0.033");
check("round half away from zero, like PostgreSQL", core.roundDecimal("4.411256", 4) === "4.4113" &&core.roundDecimal("0.05065", 4) === "0.0507" && core.roundDecimal("-0.00005", 4) === "-0.0001");
check("no floating-point drift", core.addDecimal("0.1", "0.2") === "0.3");

section("Demo reports are derived, never repaired");
const demo = await import("../src/lib/data-migration/food-sock-demo.ts");
const demoPlan = buildFoodSockPlan(qaSources(), emptyTarget("00000000-0000-4000-8000-00000000bbbb"));
const deps = demo.buildDemoDependencies(demoPlan);
const loafDep = deps.find((d) => d.key === "product:sku:QA-1");
check("dependency report covers the demo product", Boolean(loafDep) && deps.every((d) => demoPlan.demoReadiness.find((r) => `product:${r.productKey}` === d.key)?.ready));
const flourDep = loafDep?.components.find((c) => c.component === "QA Flour");
check("component carries product row, BOM row, exact kg quantity and cost source row", flourDep?.productRow === 2 && flourDep?.bomRow === 2 && flourDep?.quantityPerUnit === "0.25" && flourDep?.costSource?.kind === "purchase_order" && flourDep?.costSource?.row === 2);
check("opening stock cited by its row, and units it supports computed exactly", flourDep?.opening?.stockRow === 2 && flourDep?.opening?.quantity === "12.345678" && flourDep?.unitsSupportedByOpeningStock === 49);
check("limiting component identified (5 bags, 1 per loaf; flour would allow 49)", loafDep?.limitingComponent === "QA Bag" && loafDep?.maxUnitsFromOpeningStock === 5,`${loafDep?.limitingComponent} ${loafDep?.maxUnitsFromOpeningStock}`);
const openingRows = demo.buildOpeningStockReport(demoPlan);
const flourOpening = openingRows.find((r) => r.sourceItem === "qa flour");
check("opening report: stored value and rounding difference in the source unit", flourOpening?.storedQuantity === "12.3457" && flourOpening?.roundingDifference === "-0.022" && flourOpening?.included === true);
check("opening report: negative and unknown-cost rows excluded with reasons", openingRows.find((r) => r.sourceItem === "test")?.included === false && /negative_stock/.test(openingRows.find((r) => r.sourceItem === "test")?.reason || "") && openingRows.find((r) => r.sourceItem === "qa salt")?.included === false);
const qaDemoConfig = {
  primaryProductKey: "product:sku:QA-1",
  clientQuestions: [
    { id: "QA-price", question: "Synthetic price question?", affected: { category: "Meal for 4" }, demoImpact: "Display only." },
    { id: "QA-sku", question: "Synthetic SKU question?", affected: { issueCode: "sku_differs_from_product_range" }, demoImpact: "None." },
    { id: "QA-list", question: "Synthetic explicit-list question?", affected: { skus: [" qa-1 "] }, demoImpact: "None." },
  ],
};
const questions = demo.buildClientQuestions(demoPlan, "demo", qaDemoConfig);
check("client questions come only from the supplied configuration, all unresolved", questions.length === 3 && questions.every((q) => q.status === "unresolved") && demo.buildClientQuestions(demoPlan).length === 0);
check("category rule lists priced products in that category; primary product flagged", questions[0].affectedProductKeys.includes("product:sku:QA-1") && questions[0].affectsPrimaryDemoProduct === true);
check("issue-code rule: none in this fixture", questions[1].affectedProductKeys.length === 0);
check("explicit SKU list matches by normalised SKU only", questions[2].affectedProductKeys.join() === "product:sku:QA-1");
check("featured product only when configured", demo.buildDemoReport(demoPlan).primaryDemoProduct === null && demo.buildDemoReport(demoPlan, "demo", qaDemoConfig).primaryDemoProduct?.key === "product:sku:QA-1");
const gtins = demo.buildBarcodeReport(demoPlan);
check("barcodes stay unresolved and are never written", gtins.every((g) => g.status === "unresolved" && g.written === false));
const rowsForecast = demo.expectedImportRows(demoPlan);
check("expected import rows derived from the plan", rowsForecast.vyron_cost_products === 1 && rowsForecast.vyron_cost_bom_lines === 2 && rowsForecast.vyron_import_source_links === 1 + 2 + 1 + 1 + 2, JSON.stringify(rowsForecast));

console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}.`);
process.exit(failures ? 1 : 0);
