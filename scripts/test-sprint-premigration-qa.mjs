#!/usr/bin/env node
/**
 * The 2026-11-24 sprint code running against a database WITHOUT its migrations
 * (production until they are applied). Every feature must degrade safely:
 * invoicing keeps the SI- numbers, GRNs post as before, reports load.
 *
 *   QA_SUPABASE_URL=http://127.0.0.1:59321 QA_SUPABASE_SERVICE_KEY=... node scripts/test-sprint-premigration-qa.mjs
 *
 * LOCAL QA database only (migrations 20261124120000..160000 rolled back first).
 * Seeds one random company and deletes it afterwards.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.QA_SUPABASE_URL || "";
const KEY = process.env.QA_SUPABASE_SERVICE_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_) || !KEY) {
  console.error("Refusing: local QA database only.");
  process.exit(2);
}
register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { createGoodsReceipt } = await imp("src/lib/vyron-procurement.ts");
const grnApproval = await imp("src/lib/vyron-grn-approval.ts");
const invoices = await imp("src/lib/vyron-customer-invoices.ts");
const jobCards = await imp("src/lib/vyron-job-cards.ts");
const overrides = await imp("src/lib/vyron-bom-completeness-overrides.ts");
const { getBomCompletenessReport } = await imp("src/lib/vyron-bom-completeness.ts");
const { getProductionControlReport } = await imp("src/lib/vyron-production-control.ts");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};
const must = async (q) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};
const C = randomUUID();
try {
  const probe = await sb.from("vyron_document_sequences").select("company_id").limit(1);
  if (!probe.error) throw new Error("The numbering tables exist — roll the sprint migrations back on the QA database first.");

  await must(sb.from("vyron_cost_companies").insert({ id: C, name: "QA Pre-migration" }));
  await must(sb.from("vyron_workspaces").insert({
    company_id: C, company_name: "QA Pre-migration (Pty) Ltd", trading_name: "QA Pre", physical_address: "1 Test Road, Cape Town, 8001",
    vat_number: "4123456789", vat_status: "Registered", registration_number: "2020/123456/07", default_vat_rate: 15,
  }));
  const [flour] = await must(sb.from("vyron_cost_ingredients").insert({ company_id: C, ingredient_name: "QA Flour", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 20, true_unit_cost: 20 }).select("id"));
  const [product] = await must(sb.from("vyron_cost_products").insert({ company_id: C, product_name: "QA Pie", selling_price: 20, total_cost: 8, status: "Active", product_status: "Active" }).select("id"));

  console.log("Invoices without the numbering migration");
  const line = [{ productId: product.id, productName: "QA Pie", quantity: 1, sellingPrice: 20, costPerUnit: 8 }];
  const inv = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  check("new invoice keeps the SI- number (previous behaviour)", /^SI-\d{8}$/.test(inv.invoice_number), inv.invoice_number);
  const issued = await invoices.updateCustomerInvoiceStatus(sb, inv.id, "Sent", C, "Ivy");
  check("invoice can still be issued; number unchanged", issued.status === "Sent" && issued.invoice_number === inv.invoice_number);
  const draft = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  await invoices.deleteCustomerInvoice(sb, C, draft.id);
  check("draft can still be deleted", (await must(sb.from("vyron_customer_invoices").select("id").eq("id", draft.id))).length === 0);

  console.log("GRNs without the approval migration");
  const [po] = await must(sb.from("vyron_cost_purchase_orders").insert({ company_id: C, po_number: "QA-PRE-PO", status: "Approved", supplier_name_snapshot: "QA Mills" }).select("id"));
  const [pl] = await must(sb.from("vyron_cost_purchase_order_lines").insert({
    company_id: C, purchase_order_id: po.id, item_name: "QA Flour", item_type: "ingredient", item_id: flour.id, ingredient_id: flour.id,
    quantity: 10, ordered_qty: 10, unit: "kg", unit_price: 20, unit_cost: 20, received_qty: 0, damaged_qty: 0, rejected_qty: 0, outstanding_qty: 10,
  }).select("id"));
  const grn = await createGoodsReceipt(sb, C, {
    purchase_order_id: po.id, receipt_type: "partial",
    lines: [{ purchase_order_line_id: pl.id, item_name: "QA Flour", ordered_qty: 10, received_qty: 4, damaged_qty: 0, rejected_qty: 0, unit: "kg" }],
  }, "Rita", { userId: "u1" });
  check("GRN posts immediately as before", grn.grn.status === "Posted" && grn.pendingApproval === false);
  const ledger = await must(sb.from("vyron_cost_stock_ledger").select("id").eq("company_id", C).eq("reference_id", grn.grn.id));
  check("stock posted once", ledger.length === 1);
  const setting = await grnApproval.getGrnApprovalSetting(sb, C);
  check("approval setting reports 'not installed'", setting.installed === false && setting.approvalRequired === false);
  check("dashboard pending list is empty, not an error", (await grnApproval.listPendingGrnApprovals(sb, C, "u2")).length === 0);

  console.log("Reports and job cards without their migrations");
  const bom = await getBomCompletenessReport(sb, C);
  check("BOM completeness report loads; overrides marked unavailable", bom.overridesAvailable === false && bom.rows.length === 1);
  let ovErr = null;
  try { await overrides.createBomCompletenessOverride(sb, C, { id: "u", name: "U" }, { productId: product.id, reason: "Checked and valid for ops" }); } catch (e) { ovErr = e; }
  check("override refused with 503 'cannot be recorded yet'", ovErr?.status === 503, ovErr?.message);
  const pcr = await getProductionControlReport(sb, C, { from: "2026-11-25", to: "2026-11-25", view: "daily", today: "2026-11-25" });
  check("production control report loads", Array.isArray(pcr.jobs));
  const [so] = await must(sb.from("vyron_customer_sales_orders").insert({ company_id: C, order_number: "QA-PRE-SO", customer_name: "X", status: "Approved" }).select("id"));
  let jcErr = null;
  try { await jobCards.buildJobCardDocuments(sb, C, "customer_sales_order", [so.id], "QA"); } catch (e) { jcErr = e; }
  check("job card refused with 503 'not installed'", jcErr?.status === 503 && /not installed/.test(jcErr.message), jcErr?.message);
} catch (err) {
  fail++;
  console.log("  FAIL unexpected error —", err?.stack || err);
} finally {
  const invIds = (await sb.from("vyron_customer_invoices").select("id").eq("company_id", C)).data?.map((r) => r.id) || [];
  if (invIds.length) await sb.from("vyron_customer_invoice_lines").delete().in("invoice_id", invIds);
  for (const t of [
    "vyron_cost_stock_ledger", "vyron_inventory_audit_log", "vyron_procurement_audit_log", "vyron_cost_back_orders", "vyron_cost_goods_receipt_lines",
    "vyron_cost_goods_receipts", "vyron_cost_purchase_order_lines", "vyron_cost_purchase_orders", "vyron_cost_stock_items", "vyron_customer_invoices",
    "vyron_customer_sales_orders", "vyron_cost_products", "vyron_cost_ingredients", "vyron_procurement_three_way_matches",
  ]) await sb.from(t).delete().eq("company_id", C);
  await sb.from("vyron_workspaces").delete().eq("company_id", C);
  await sb.from("vyron_cost_companies").delete().eq("id", C);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
