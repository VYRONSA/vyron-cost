#!/usr/bin/env node
/**
 * Box Qty on a saved invoice (draft or issued): setCustomerInvoiceBoxQuantities.
 *
 * Runs the REAL library function against an in-memory Supabase stand-in. Proves that only
 * box_qty changes (quantity, prices, VAT and totals untouched; lines updated in place, never
 * re-inserted), that issued invoices accept it and Cancelled ones refuse it, that another
 * tenant's invoice or a foreign line is refused, that bad values are refused before any write,
 * and that every change is audited — and put back when the audit cannot be written.
 * Family A: no network, no database, no credentials.
 *
 *   npm run test:customer-invoice-box-qty-edit
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-customer-invoices.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

/** Minimal PostgREST-style builder over in-memory tables: select/eq/order/limit/maybeSingle/single/update/insert. */
function fakeSupabase(tables, opts = {}) {
  const log = [];
  function builder(table) {
    const state = { op: "select", filters: [], patch: null, rows: null, returning: false };
    const rowsOf = () => (tables[table] ||= []);
    const matches = (row) => state.filters.every(([col, val]) => row[col] === val);
    const run = () => {
      if (state.op === "insert") {
        if (opts.failInsert?.(table)) return { data: null, error: { message: `insert into ${table} failed` } };
        const list = Array.isArray(state.rows) ? state.rows : [state.rows];
        rowsOf().push(...list.map((r) => ({ ...r })));
        log.push({ table, op: "insert", rows: list });
        return { data: list, error: null };
      }
      if (state.op === "update") {
        const hit = rowsOf().filter(matches);
        for (const row of hit) Object.assign(row, state.patch);
        log.push({ table, op: "update", patch: { ...state.patch }, filters: [...state.filters], count: hit.length });
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      return { data: rowsOf().filter(matches).map((r) => ({ ...r })), error: null };
    };
    const api = {
      select() { if (state.op !== "select") state.returning = true; return api; },
      eq(col, val) { state.filters.push([col, val]); return api; },
      order() { return api; },
      limit() { return api; },
      update(patch) { state.op = "update"; state.patch = patch; return api; },
      insert(rows) { state.op = "insert"; state.rows = rows; return api; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      single() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return api;
  }
  return { from: (table) => builder(table), log };
}

const CO = "co-1";
const line = (id, extra = {}) => ({
  id, invoice_id: "inv-1", product_id: `p-${id}`, product_name: `Pie ${id}`, quantity: 24, selling_price: 30, cost_per_unit: 12,
  line_total: 720, line_cost: 288, line_gp: 432, tax_treatment: "standard", tax_rate: 15, discount_percent: 0, discount_amount: 0,
  taxable_amount: 720, tax_amount: 108, line_total_incl_tax: 828, box_qty: null, created_at: `2026-11-11T08:0${id.slice(-1)}:00Z`, ...extra,
});
const world = (status = "Sent", extra = {}) => ({
  vyron_customer_invoices: [{ id: "inv-1", company_id: CO, invoice_number: "SI-1", status, sales_value: 1440, ...extra }],
  vyron_customer_invoice_lines: [line("l1"), line("l2", { box_qty: 2 })],
  vyron_inventory_audit_log: [],
});
const actor = { id: "user-1", name: "Thandi M" };
const financial = (l) => JSON.stringify([l.quantity, l.selling_price, l.cost_per_unit, l.line_total, l.tax_amount, l.line_total_incl_tax, l.taxable_amount, l.discount_percent]);

console.log("issued invoice (Sent): Box Qty only");
{
  const t = world("Sent");
  const before = t.vyron_customer_invoice_lines.map(financial);
  const headerBefore = JSON.stringify(t.vyron_customer_invoices[0]);
  const db = fakeSupabase(t);
  const res = await m.setCustomerInvoiceBoxQuantities(db, CO, "inv-1", [{ lineId: "l1", boxQty: "3" }, { lineId: "l2", boxQty: 2 }], actor);
  const l1 = t.vyron_customer_invoice_lines.find((l) => l.id === "l1");
  check("Box Qty saved on the named line", l1.box_qty === 3, String(l1.box_qty));
  check("unchanged line not written", res.changed === 1 && db.log.filter((x) => x.op === "update" && x.table === "vyron_customer_invoice_lines").length === 1);
  check("only box_qty is written", db.log.filter((x) => x.op === "update").every((x) => Object.keys(x.patch).join() === "box_qty"));
  check("update is scoped to the line AND the invoice", db.log.filter((x) => x.op === "update").every((x) => x.filters.some(([c, v]) => c === "invoice_id" && v === "inv-1") && x.filters.some(([c]) => c === "id")));
  check("quantity, prices, VAT and totals unchanged", JSON.stringify(t.vyron_customer_invoice_lines.map(financial)) === JSON.stringify(before));
  check("invoice header untouched", JSON.stringify(t.vyron_customer_invoices[0]) === headerBefore);
  check("no line deleted or re-inserted", !db.log.some((x) => x.table === "vyron_customer_invoice_lines" && x.op === "insert") && t.vyron_customer_invoice_lines.length === 2);
  const audit = t.vyron_inventory_audit_log;
  check("one audit record written", audit.length === 1, JSON.stringify(audit));
  check("audit names event, invoice, member, old and new value", audit[0]?.event_type === "customer_invoice_box_qty_changed" && audit[0].reference_type === "customer_invoice" && audit[0].reference_id === "inv-1" && audit[0].actor === "Thandi M" && audit[0].old_value === "-" && audit[0].new_value === "3" && audit[0].company_id === CO);
  check("audit metadata keeps the member id and line detail", audit[0]?.metadata.actorId === "user-1" && audit[0].metadata.lines[0].lineId === "l1" && audit[0].metadata.invoiceStatus === "Sent");
  check("returns the reloaded lines", res.lines.find((l) => l.id === "l1").box_qty === 3);
}

for (const status of ["Draft", "Approved", "Posted", "Paid"]) {
  const t = world(status);
  await m.setCustomerInvoiceBoxQuantities(fakeSupabase(t), CO, "inv-1", [{ lineId: "l1", boxQty: 1.5 }], actor);
  check(`${status} invoice accepts Box Qty`, t.vyron_customer_invoice_lines[0].box_qty === 1.5);
}

console.log("clearing and decimals");
{
  const t = world("Sent");
  await m.setCustomerInvoiceBoxQuantities(fakeSupabase(t), CO, "inv-1", [{ lineId: "l2", boxQty: "" }], actor);
  check("empty clears Box Qty to NULL (prints '-')", t.vyron_customer_invoice_lines[1].box_qty === null);
  check("clearing is audited 2 -> -", t.vyron_inventory_audit_log[0]?.old_value === "2" && t.vyron_inventory_audit_log[0]?.new_value === "-");
  const t2 = world("Sent");
  await m.setCustomerInvoiceBoxQuantities(fakeSupabase(t2), CO, "inv-1", [{ lineId: "l1", boxQty: "0.12345" }], actor);
  check("decimals kept to 4 places", t2.vyron_customer_invoice_lines[0].box_qty === 0.1235, String(t2.vyron_customer_invoice_lines[0].box_qty));
  const t3 = world("Sent");
  const db3 = fakeSupabase(t3);
  const r3 = await m.setCustomerInvoiceBoxQuantities(db3, CO, "inv-1", [{ lineId: "l2", boxQty: "2" }], actor);
  check("same value: nothing written, nothing audited", r3.changed === 0 && !db3.log.some((x) => x.op !== "select") && t3.vyron_inventory_audit_log.length === 0);
}

console.log("refusals (nothing written)");
async function refused(name, t, args, pattern) {
  const db = fakeSupabase(t);
  let error = null;
  try { await m.setCustomerInvoiceBoxQuantities(db, ...args); } catch (e) { error = e; }
  const wrote = db.log.some((x) => x.op === "update" || x.op === "insert");
  check(name, error && pattern.test(`${error.name} ${error.message}`) && !wrote, error ? `${error.name}: ${error.message}; wrote=${wrote}` : "no error");
}
await refused("Cancelled invoice refused", world("Cancelled"), [CO, "inv-1", [{ lineId: "l1", boxQty: 1 }], actor], /BoxQtyNotEditableError.*Cancelled/);
await refused("another tenant's invoice is not found", world("Sent"), ["co-2", "inv-1", [{ lineId: "l1", boxQty: 1 }], actor], /InvoiceNotFoundError/);
await refused("a line from another invoice refused", world("Sent"), [CO, "inv-1", [{ lineId: "l-other", boxQty: 1 }], actor], /does not belong/);
await refused("negative Box Qty refused", world("Sent"), [CO, "inv-1", [{ lineId: "l1", boxQty: -1 }], actor], /InvalidBoxQtyError/);
await refused("text Box Qty refused", world("Sent"), [CO, "inv-1", [{ lineId: "l1", boxQty: "two" }], actor], /InvalidBoxQtyError/);
await refused("a bad value on a later line refuses the whole request", world("Sent"), [CO, "inv-1", [{ lineId: "l1", boxQty: 4 }, { lineId: "l2", boxQty: "x" }], actor], /InvalidBoxQtyError/);
await refused("empty request refused", world("Sent"), [CO, "inv-1", [], actor], /No Box Qty/);

console.log("audit failure puts the change back");
{
  const t = world("Sent");
  const db = fakeSupabase(t, { failInsert: (table) => table === "vyron_inventory_audit_log" });
  let error = null;
  try { await m.setCustomerInvoiceBoxQuantities(db, CO, "inv-1", [{ lineId: "l1", boxQty: 5 }, { lineId: "l2", boxQty: 7 }], actor); } catch (e) { error = e; }
  check("refused with the audit reason", error && /audit record could not be written/.test(error.message), String(error?.message));
  check("both lines restored to their previous Box Qty", t.vyron_customer_invoice_lines[0].box_qty === null && t.vyron_customer_invoice_lines[1].box_qty === 2, JSON.stringify(t.vyron_customer_invoice_lines.map((l) => l.box_qty)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
