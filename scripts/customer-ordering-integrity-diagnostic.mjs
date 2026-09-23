#!/usr/bin/env node
/**
 * @vyron-safety
 * family: A
 * mutation: none
 * authentication: service-role (read)
 * external: none
 *
 * VOLORA — production integrity diagnostic for Customer Ordering. READ ONLY.
 *
 * Generic: it takes a company id and reports on that company. It knows nothing
 * about any particular client, and there is no client name or identifier
 * anywhere in this file.
 *
 * Four diagnostics:
 *   A  reservations held by orders that should no longer hold stock
 *   B  the Stock Master balance against the last ledger balance per item
 *   C  customers whose assigned price list does not cover what they can see
 *   D  the legacy finished-goods bucket against the Stock Master
 *
 * HOW THIS IS READ-ONLY, AND NOT MERELY INTENDED TO BE
 * ----------------------------------------------------
 * It does not use the Supabase client at all. It speaks to PostgREST over
 * plain HTTP and issues **GET requests only** — there is no code path in this
 * file that can produce a POST, PATCH, PUT, DELETE or RPC call. A GET cannot
 * write. `fetch` itself is wrapped so that anything other than GET throws
 * before it leaves the process.
 *
 * It also refuses to run unless the database it is pointed at is allowlisted
 * as production (this is a production diagnostic; running it anywhere else
 * would produce a report about the wrong data), and unless the operator names
 * the company explicitly.
 *
 *   node scripts/customer-ordering-integrity-diagnostic.mjs --list-companies
 *   node scripts/customer-ordering-integrity-diagnostic.mjs --company <company_id> [--report <file.json>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Only GET leaves this process.
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const method = String(init.method || "GET").toUpperCase();
  if (method !== "GET") {
    throw new Error(`BLOCKED: this diagnostic is read-only and attempted a ${method} request. Nothing was sent.`);
  }
  return realFetch(input, init);
};

// ---------------------------------------------------------------------------
// Environment and identity
// ---------------------------------------------------------------------------
const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const at = trimmed.indexOf("=");
  if (at === -1) continue;
  env[trimmed.slice(0, at)] = trimmed.slice(at + 1).replace(/^"|"$/g, "");
}

const SUPABASE_URL = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const projectRef = (SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\./i) || [])[1] || null;
const allowlist = JSON.parse(readFileSync(path.join(ROOT, "scripts/safety/allowlist.json"), "utf8"));
const entry = projectRef ? allowlist.supabaseProjects?.[projectRef] : null;

console.log("\n" + "=".repeat(78));
console.log("  VOLORA — CUSTOMER ORDERING INTEGRITY DIAGNOSTIC (READ ONLY)");
console.log("=".repeat(78));
console.log(`  database        : ${projectRef || "(unparsed)"}`);
console.log(`  allowlisted as  : ${entry ? entry.environment : "NOT LISTED"}${entry?.unresolved ? " (UNRESOLVED)" : ""}`);
console.log(`  confirmed by    : ${entry?.confirmedBy || "-"} ${entry?.confirmedAt || ""}`);
console.log(`  requests        : GET only. No write of any kind is possible from this file.`);

if (!entry || entry.unresolved || entry.environment !== "production") {
  console.error("\n  REFUSED: this diagnostic reports on production and the database it is pointed at");
  console.error("  is not allowlisted as production. Nothing was read.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The only way this file talks to the database.
// ---------------------------------------------------------------------------
let requestCount = 0;
async function get(table, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;
  // A read can be retried freely: it changes nothing whether it arrives once,
  // twice or not at all.
  for (let attempt = 1; ; attempt++) {
    requestCount++;
    try {
      const res = await realFetch(url, {
        method: "GET",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GET ${table} failed (${res.status}): ${body.slice(0, 300)}`);
      }
      return res.json();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/** Read every row of a table in pages, so nothing is silently truncated. */
async function getAll(table, query = "", pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await get(table, `${query}${query ? "&" : ""}limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : process.argv[at + 1] || true;
};

// ---------------------------------------------------------------------------
// Company identity — never guessed
// ---------------------------------------------------------------------------
if (process.argv.includes("--list-companies")) {
  // Several sources, because a tenant can exist without a workspace row: the
  // owner/workspace registry was not backfilled for every company.
  const seen = new Map();
  const note = (id, name, source) => {
    const key = String(id || "");
    if (!key || key === "null") return;
    const existing = seen.get(key) || { name: null, sources: new Set() };
    if (name && !existing.name) existing.name = String(name);
    existing.sources.add(source);
    seen.set(key, existing);
  };
  for (const row of await getAll("vyron_workspaces", "select=company_id,company_name")) note(row.company_id, row.company_name, "workspace");
  try {
    for (const row of await getAll("vyron_cost_companies", "select=id,company_name")) note(row.id, row.company_name, "companies");
  } catch {
    console.log("  (vyron_cost_companies could not be read with these columns)");
  }
  for (const row of await getAll("vyron_cost_products", "select=company_id")) note(row.company_id, null, "products");
  for (const row of await getAll("vyron_customers", "select=company_id")) note(row.company_id, null, "customers");
  for (const row of await getAll("vyron_cost_stock_items", "select=company_id")) note(row.company_id, null, "stock");

  console.log(`\n  ${seen.size} companies with data in this database:\n`);
  for (const [id, info] of seen) {
    console.log(`    ${id}  ${String(info.name || "(no name row)").padEnd(40)} [${[...info.sources].join(", ")}]`);
  }
  console.log(`\n  ${requestCount} GET request(s). Nothing was written.\n`);
  process.exit(0);
}

/** Find a tenant by name, across the places a name can live. Read-only. */
if (typeof arg("--find") === "string") {
  const needle = String(arg("--find"));
  console.log(`
  Searching for "${needle}" …
`);
  const show = (label, rows, fields) => {
    console.log(`  ${label}: ${rows.length} match(es)`);
    for (const row of rows.slice(0, 25)) console.log(`    ${fields.map((f) => `${f}=${row[f] ?? ""}`).join("  ")}`);
  };
  show("workspaces", await getAll("vyron_workspaces", `select=company_id,company_name&company_name=ilike.*${needle}*`), ["company_id", "company_name"]);
  show("customers", await getAll("vyron_customers", `select=id,company_id,customer_name&customer_name=ilike.*${needle}*`), ["company_id", "customer_name"]);
  try {
    show("companies", await getAll("vyron_cost_companies", `select=id,company_name&company_name=ilike.*${needle}*`), ["id", "company_name"]);
  } catch {
    console.log("  companies: table not readable with that column");
  }
  console.log(`
  ${requestCount} GET request(s). Nothing was written.
`);
  process.exit(0);
}

const COMPANY = arg("--company");
if (typeof COMPANY !== "string") {
  console.error("\n  Name the company explicitly: --company <company_id>");
  console.error("  (--list-companies shows them. The company is never guessed from a name.)\n");
  process.exit(1);
}

const workspace = await get("vyron_workspaces", `select=company_id,company_name&company_id=eq.${COMPANY}&limit=1`);
if (!workspace.length) {
  console.error(`\n  REFUSED: no workspace for company ${COMPANY} in this database. Nothing further was read.\n`);
  process.exit(1);
}
const COMPANY_NAME = String(workspace[0].company_name || "(unnamed)");
console.log(`  company         : ${COMPANY}`);
console.log(`  company name    : ${COMPANY_NAME}`);
console.log("=".repeat(78));

const n = (v) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const round4 = (v) => Math.round(n(v) * 10000) / 10000;
const section = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

/**
 * The statuses an order must be in for its reservation to still hold stock —
 * the same rule the application uses (vyron-sales-order-reservations.ts).
 */
const HOLDING_STATUSES = ["Draft", "Awaiting Approval", "Approved", "Picking", "Packed", "Dispatched", "Partially Invoiced"];

const report = { company: COMPANY, companyName: COMPANY_NAME, projectRef, generatedAt: new Date().toISOString() };

// ---------------------------------------------------------------------------
// A. Reservations held by orders that should no longer hold stock
// ---------------------------------------------------------------------------
section("A. Reservations");
const allocations = await getAll(
  "vyron_customer_sales_order_allocations",
  `select=id,sales_order_id,product_id,reserved_qty,status,created_at&company_id=eq.${COMPANY}`
);
const orderIds = [...new Set(allocations.map((a) => String(a.sales_order_id)).filter(Boolean))];
const orders = new Map();
for (let i = 0; i < orderIds.length; i += 100) {
  const batch = orderIds.slice(i, i + 100);
  const rows = await get(
    "vyron_customer_sales_orders",
    `select=id,order_number,status,customer_name,created_at&company_id=eq.${COMPANY}&id=in.(${batch.join(",")})`
  );
  for (const row of rows) orders.set(String(row.id), row);
}

const products = new Map();
const productIds = [...new Set(allocations.map((a) => String(a.product_id)).filter(Boolean))];
for (let i = 0; i < productIds.length; i += 100) {
  const batch = productIds.slice(i, i + 100);
  const rows = await get("vyron_cost_products", `select=id,product_name,sku&company_id=eq.${COMPANY}&id=in.(${batch.join(",")})`);
  for (const row of rows) products.set(String(row.id), row);
}

const reserved = allocations.filter((a) => String(a.status) === "Reserved");
const orphans = reserved.filter((a) => {
  const order = orders.get(String(a.sales_order_id));
  return !order || !HOLDING_STATUSES.includes(String(order.status));
});
const holding = reserved.filter((a) => !orphans.includes(a));

console.log(`  allocation rows          : ${allocations.length}`);
console.log(`  status Reserved          : ${reserved.length}`);
console.log(`  status Converted / other : ${allocations.length - reserved.length}`);
console.log(`  holding stock now        : ${holding.length} (${round4(holding.reduce((s, a) => s + n(a.reserved_qty), 0))} units)`);
console.log(`  ORPHANS                  : ${orphans.length} (${round4(orphans.reduce((s, a) => s + n(a.reserved_qty), 0))} units)`);
if (orphans.length) {
  console.log("\n  order            status        product                          qty   reservation");
  for (const row of orphans.slice(0, 50)) {
    const order = orders.get(String(row.sales_order_id));
    const product = products.get(String(row.product_id));
    console.log(
      `  ${String(order?.order_number || row.sales_order_id).padEnd(16)} ${String(order?.status || "NO ORDER").padEnd(13)} ` +
        `${String(product?.sku || product?.product_name || row.product_id).slice(0, 30).padEnd(32)} ${String(round4(row.reserved_qty)).padStart(6)}  ${row.status}`
    );
  }
  if (orphans.length > 50) console.log(`  … and ${orphans.length - 50} more`);
}
report.reservations = {
  total: allocations.length,
  reserved: reserved.length,
  holding: holding.length,
  holdingUnits: round4(holding.reduce((s, a) => s + n(a.reserved_qty), 0)),
  orphans: orphans.map((a) => {
    const order = orders.get(String(a.sales_order_id));
    const product = products.get(String(a.product_id));
    return {
      orderNumber: order?.order_number || null,
      orderId: String(a.sales_order_id),
      orderStatus: order?.status || "ORDER NOT FOUND",
      customer: order?.customer_name || null,
      sku: product?.sku || null,
      productName: product?.product_name || null,
      productId: String(a.product_id),
      reservedQty: round4(a.reserved_qty),
      allocationStatus: a.status,
    };
  }),
};

// ---------------------------------------------------------------------------
// B. Stock Master against the last ledger balance
// ---------------------------------------------------------------------------
section("B. Stock Master vs the stock ledger");
const stockItems = await getAll(
  "vyron_cost_stock_items",
  `select=id,entity_type,entity_id,item_code,qty_on_hand,last_movement_at&company_id=eq.${COMPANY}&order=item_code`
);
console.log(`  stock items              : ${stockItems.length}`);

const comparisons = [];
for (const item of stockItems) {
  const latest = await get(
    "vyron_cost_stock_ledger",
    `select=id,movement_date,movement_type,balance_after,quantity_in,quantity_out&stock_item_id=eq.${item.id}&order=movement_date.desc,id.desc&limit=1`
  );
  const ledgerBalance = latest.length ? n(latest[0].balance_after) : null;
  const master = n(item.qty_on_hand);
  comparisons.push({
    stockItemId: String(item.id),
    itemCode: item.item_code || null,
    entityType: item.entity_type,
    entityId: String(item.entity_id || ""),
    master: round4(master),
    ledger: ledgerBalance === null ? null : round4(ledgerBalance),
    difference: ledgerBalance === null ? null : round4(master - ledgerBalance),
    lastMovementType: latest.length ? latest[0].movement_type : null,
    lastMovementDate: latest.length ? latest[0].movement_date : null,
  });
}
const noLedger = comparisons.filter((c) => c.ledger === null);
const matches = comparisons.filter((c) => c.ledger !== null && Math.abs(c.difference) < 0.00005);
const differs = comparisons.filter((c) => c.ledger !== null && Math.abs(c.difference) >= 0.00005);
console.log(`  exact matches            : ${matches.length}`);
console.log(`  DIFFERENCES              : ${differs.length}`);
console.log(`  no ledger movement yet   : ${noLedger.length} (nothing to compare — not a discrepancy)`);
console.log(`  stock master total       : ${round4(comparisons.reduce((s, c) => s + c.master, 0))}`);
console.log(`  ledger total (last balance per item): ${round4(comparisons.filter((c) => c.ledger !== null).reduce((s, c) => s + c.ledger, 0))}`);
if (differs.length) {
  console.log("\n  item                       type             master      ledger   difference   last movement");
  for (const row of differs.slice(0, 60)) {
    console.log(
      `  ${String(row.itemCode || row.entityId).slice(0, 24).padEnd(26)} ${String(row.entityType).padEnd(15)} ` +
        `${String(row.master).padStart(10)} ${String(row.ledger).padStart(11)} ${String(row.difference).padStart(12)}   ${row.lastMovementType || ""}`
    );
  }
  if (differs.length > 60) console.log(`  … and ${differs.length - 60} more`);
}
report.stock = {
  items: stockItems.length,
  matches: matches.length,
  differences: differs.length,
  noLedger: noLedger.length,
  masterTotal: round4(comparisons.reduce((s, c) => s + c.master, 0)),
  ledgerTotal: round4(comparisons.filter((c) => c.ledger !== null).reduce((s, c) => s + c.ledger, 0)),
  differing: differs,
  unledgered: noLedger.map((c) => ({ itemCode: c.itemCode, entityType: c.entityType, master: c.master })),
};

// ---------------------------------------------------------------------------
// C. Price-list coverage
// ---------------------------------------------------------------------------
section("C. Customer price-list coverage");
const customers = await getAll("vyron_customers", `select=id,customer_name,status,active&company_id=eq.${COMPANY}&order=customer_name`);
const assignments = await getAll(
  "vyron_customer_price_list_assignments",
  `select=customer_id,default_price_list_id,contract_price_list_id,status&company_id=eq.${COMPANY}`
);
const priceItems = await getAll(
  "vyron_customer_price_list_items",
  `select=price_list_id,product_id,final_price,status,effective_from,effective_to&company_id=eq.${COMPANY}`
);
const catalogueProducts = await getAll(
  "vyron_cost_products",
  `select=id,product_name,sku,selling_price,status,product_status&company_id=eq.${COMPANY}&order=product_name`
);
const blocked = ["inactive", "archived", "discontinued", "disabled"];
const sellable = catalogueProducts.filter(
  (p) => !blocked.includes(String(p.status || "").toLowerCase()) && !blocked.includes(String(p.product_status || "").toLowerCase())
);
const today = new Date().toISOString().slice(0, 10);
const activeItems = priceItems.filter((i) => {
  if (String(i.status || "Active") !== "Active") return false;
  const startsOk = i.effective_from ? String(i.effective_from) <= today : true;
  const endsOk = i.effective_to ? String(i.effective_to) >= today : true;
  return startsOk && endsOk;
});

console.log(`  customers                : ${customers.length}`);
console.log(`  with a price-list assignment (Active): ${assignments.filter((a) => String(a.status || "Active") === "Active").length}`);
console.log(`  products visible to a customer      : ${sellable.length} of ${catalogueProducts.length}`);

const coverage = [];
for (const customer of customers) {
  const assignment = assignments.find((a) => String(a.customer_id) === String(customer.id) && String(a.status || "Active") === "Active");
  if (!assignment) {
    coverage.push({ customerId: String(customer.id), customer: customer.customer_name, priceList: null, assigned: false, uncovered: [], note: "No price list assigned — every product is priced from the product master." });
    continue;
  }
  const listIds = [assignment.contract_price_list_id, assignment.default_price_list_id].filter(Boolean).map(String);
  const covered = new Set(activeItems.filter((i) => listIds.includes(String(i.price_list_id)) && n(i.final_price) > 0).map((i) => String(i.product_id)));
  const uncovered = sellable.filter((p) => !covered.has(String(p.id)));
  coverage.push({
    customerId: String(customer.id),
    customer: customer.customer_name,
    priceList: listIds.join(", "),
    assigned: true,
    coveredCount: covered.size,
    uncovered: uncovered.map((p) => ({ productId: String(p.id), sku: p.sku, productName: p.product_name, masterPrice: n(p.selling_price) })),
  });
}
const assigned = coverage.filter((c) => c.assigned);
const incomplete = assigned.filter((c) => c.uncovered.length > 0);
console.log(`  customers with a list    : ${assigned.length}`);
console.log(`  fully covered            : ${assigned.length - incomplete.length}`);
console.log(`  WITH UNCOVERED PRODUCTS  : ${incomplete.length}`);
for (const row of incomplete.slice(0, 20)) {
  console.log(`    ${String(row.customer).slice(0, 34).padEnd(36)} ${row.uncovered.length} of ${sellable.length} products have no price on their list`);
}
if (incomplete.length > 20) console.log(`    … and ${incomplete.length - 20} more customers`);
report.priceLists = {
  customers: customers.length,
  assigned: assigned.length,
  fullyCovered: assigned.length - incomplete.length,
  incomplete: incomplete.map((c) => ({ customer: c.customer, customerId: c.customerId, priceList: c.priceList, coveredCount: c.coveredCount, uncoveredCount: c.uncovered.length, uncovered: c.uncovered.slice(0, 25) })),
  unassigned: coverage.filter((c) => !c.assigned).map((c) => ({ customer: c.customer, customerId: c.customerId })),
  sellableProducts: sellable.length,
};

// ---------------------------------------------------------------------------
// D. Legacy finished goods against the Stock Master
// ---------------------------------------------------------------------------
section("D. Finished goods (legacy bucket) vs Stock Master");
let finishedGoods = [];
let legacyTablePresent = true;
let legacyEmpty = false;
try {
  // The shape of this legacy table differs between deployments, so look before
  // asking for columns by name.
  const probe = await get("vyron_finished_goods", "select=*&limit=1");
  if (!probe.length) {
    legacyEmpty = true;
    console.log("  the legacy finished-goods table is present but EMPTY — nothing to reconcile, and no discrepancy.");
  } else {
    const columns = Object.keys(probe[0]);
    const companyColumn = columns.includes("company_id") ? "company_id" : null;
    const productColumn = ["product_id", "vyron_product_id", "cost_product_id"].find((c) => columns.includes(c)) || null;
    const qtyColumn = ["current_stock", "qty_on_hand", "stock_qty"].find((c) => columns.includes(c)) || null;
    const nameColumn = ["product_name", "name", "description"].find((c) => columns.includes(c)) || null;
    if (!productColumn || !qtyColumn) {
      legacyTablePresent = false;
      console.log(`  the legacy table has an unexpected shape (columns: ${columns.join(", ")}). Reported as REQUIRES INVESTIGATION rather than guessed.`);
    } else {
      const fields = [productColumn, qtyColumn, nameColumn].filter(Boolean).join(",");
      finishedGoods = (await getAll("vyron_finished_goods", `select=${fields}${companyColumn ? `&${companyColumn}=eq.${COMPANY}` : ""}`)).map((row) => ({
        product_id: row[productColumn],
        current_stock: row[qtyColumn],
        product_name: nameColumn ? row[nameColumn] : null,
      }));
      if (!companyColumn) console.log("  (the legacy table has no company column; every row in it was compared)");
    }
  }
} catch (error) {
  legacyTablePresent = false;
  console.log(`  the legacy table is not readable here: ${String(error.message).slice(0, 160)}`);
}
if (legacyEmpty) {
  report.finishedGoods = { present: true, empty: true, rows: 0, matches: 0, differences: 0, withoutMaster: 0, differing: [], orphans: [] };
} else if (legacyTablePresent) {
  const masterByProduct = new Map();
  for (const item of stockItems.filter((s) => String(s.entity_type) === "finished_goods")) {
    masterByProduct.set(String(item.entity_id), round4(n(item.qty_on_hand) + n(masterByProduct.get(String(item.entity_id)) || 0)));
  }
  const rows = finishedGoods.map((fg) => {
    const master = masterByProduct.has(String(fg.product_id)) ? masterByProduct.get(String(fg.product_id)) : null;
    return {
      productId: String(fg.product_id || ""),
      productName: fg.product_name || null,
      legacy: round4(fg.current_stock),
      master,
      difference: master === null ? null : round4(n(fg.current_stock) - master),
    };
  });
  const fgMatches = rows.filter((r) => r.master !== null && Math.abs(r.difference) < 0.00005);
  const fgDiffers = rows.filter((r) => r.master !== null && Math.abs(r.difference) >= 0.00005);
  const fgNoMaster = rows.filter((r) => r.master === null);
  console.log(`  legacy finished-goods rows : ${rows.length}`);
  console.log(`  matching the Stock Master  : ${fgMatches.length}`);
  console.log(`  DIFFERENCES                : ${fgDiffers.length}`);
  console.log(`  no Stock Master row at all : ${fgNoMaster.length}`);
  for (const row of fgDiffers.slice(0, 40)) {
    console.log(`    ${String(row.productName || row.productId).slice(0, 38).padEnd(40)} legacy ${String(row.legacy).padStart(9)}   master ${String(row.master).padStart(9)}   diff ${String(row.difference).padStart(9)}`);
  }
  if (fgDiffers.length > 40) console.log(`    … and ${fgDiffers.length - 40} more`);
  report.finishedGoods = { present: true, rows: rows.length, matches: fgMatches.length, differences: fgDiffers.length, withoutMaster: fgNoMaster.length, differing: fgDiffers, orphans: fgNoMaster };
} else {
  report.finishedGoods = { present: false, requiresInvestigation: true };
}

// ---------------------------------------------------------------------------
// The Kingdom Foods customer records themselves
// ---------------------------------------------------------------------------
section("E. Customers whose name appears more than once");
// Near-duplicate customer records matter here because a price list, an
// ordering login and an order history all attach to ONE customer record.
const byName = new Map();
for (const customer of customers) {
  const key = String(customer.customer_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) continue;
  byName.set(key, [...(byName.get(key) || []), customer]);
}
const duplicated = [...byName.values()].filter((group) => group.length > 1);
const kingdom = duplicated.flat();
console.log(`  names carried by more than one customer record : ${duplicated.length} (${kingdom.length} records)`);
for (const customer of kingdom) {
  const row = coverage.find((c) => c.customerId === String(customer.id));
  const assignment = row?.assigned ? `price list ${row.priceList} — ${row.uncovered.length} of ${sellable.length} products uncovered` : "NO price list assigned — every product priced from the product master";
  console.log(`    ${String(customer.customer_name).slice(0, 44).padEnd(46)} ${String(customer.status || "")} ${assignment}`);
}
report.duplicateCustomers = kingdom.map((customer) => {
  const row = coverage.find((c) => c.customerId === String(customer.id));
  return {
    customerId: String(customer.id),
    customer: customer.customer_name,
    status: customer.status || null,
    active: customer.active ?? null,
    assigned: Boolean(row?.assigned),
    priceList: row?.priceList || null,
    uncoveredCount: row?.uncovered?.length ?? null,
  };
});

// ---------------------------------------------------------------------------
// F. Is the customer ordering application in use here at all?
// ---------------------------------------------------------------------------
section("F. Customer ordering application usage");
const usage = {};
for (const [label, table] of [
  ["portal sign-ins configured", "vyron_customer_portal_identities"],
  ["carts", "vyron_customer_order_carts"],
  ["customer submissions", "vyron_customer_order_submissions"],
  ["sales orders", "vyron_customer_sales_orders"],
]) {
  try {
    const rows = await getAll(table, `select=id&company_id=eq.${COMPANY}`);
    usage[table] = rows.length;
    console.log(`  ${label.padEnd(28)}: ${rows.length}`);
  } catch (error) {
    usage[table] = null;
    console.log(`  ${label.padEnd(28)}: not readable (${String(error.message).slice(0, 70)})`);
  }
}
report.usage = usage;

// Who is actually signed in to the ordering app, and are they priced?
try {
  const identities = await getAll("vyron_customer_portal_identities", `select=customer_id,status&company_id=eq.${COMPANY}`);
  console.log(`
  the customers using the ordering app:`);
  report.portalCustomers = [];
  for (const identity of identities) {
    const customer = customers.find((c) => String(c.id) === String(identity.customer_id));
    const row = coverage.find((c) => c.customerId === String(identity.customer_id));
    const priced = row?.assigned
      ? `price list ${row.priceList} — ${row.uncovered.length} of ${sellable.length} products uncovered`
      : "NO price list assigned — every product priced from the product master";
    console.log(`    ${String(customer?.customer_name || identity.customer_id).slice(0, 40).padEnd(42)} ${String(identity.status || "").padEnd(10)} ${priced}`);
    report.portalCustomers.push({
      customerId: String(identity.customer_id),
      customer: customer?.customer_name || null,
      identityStatus: identity.status || null,
      assigned: Boolean(row?.assigned),
      priceList: row?.priceList || null,
      uncoveredCount: row?.uncovered?.length ?? null,
    });
  }
} catch (error) {
  console.log(`  portal identities not readable: ${String(error.message).slice(0, 80)}`);
}

// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(78));
console.log(`  ${requestCount} GET requests. NOTHING WAS WRITTEN.`);
console.log("=".repeat(78) + "\n");

const out = arg("--report");
if (typeof out === "string") {
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`  Findings written to ${out}\n`);
}
