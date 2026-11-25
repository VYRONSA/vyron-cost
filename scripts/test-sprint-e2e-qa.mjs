#!/usr/bin/env node
/**
 * End-to-end check of the 2026-11-24 sprint against the LOCAL QA database
 * (production schema snapshot + this sprint's migrations, synthetic data only).
 *
 *   QA_SUPABASE_URL=http://127.0.0.1:59321 QA_SUPABASE_SERVICE_KEY=... node scripts/test-sprint-e2e-qa.mjs
 *
 * Runs the shipped library code with a real Supabase client. Refuses any
 * non-local URL. Seeds one fresh, random company and deletes everything it
 * created at the end. Never run against production.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.QA_SUPABASE_URL || "";
const KEY = process.env.QA_SUPABASE_SERVICE_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_) || !KEY) {
  console.error("Refusing: QA_SUPABASE_URL must be a local http://127.0.0.1:<port> URL and QA_SUPABASE_SERVICE_KEY set.");
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
const { updateProductionRunControl } = await imp("src/lib/vyron-production-run-control.ts");

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
const RECEIVER = { id: "user-receiver", name: "Rita Receiver" };
const APPROVER = { userId: "user-approver", name: "Andile Approver" };
const APPROVER2 = { userId: "user-approver-2", name: "Bongi Approver" };

try {
  /* ------------------------------------------------------------- seed */
  await must(sb.from("vyron_cost_companies").insert({ id: C, name: "QA Sprint Foods (Pty) Ltd" }));
  await must(sb.from("vyron_workspaces").insert({
    company_id: C, company_name: "QA Sprint Foods (Pty) Ltd", trading_name: "QA Sprint Foods",
    physical_address: "1 Test Road, Cape Town, 8001", vat_number: "4123456789", vat_status: "Registered",
    registration_number: "2020/123456/07", default_vat_rate: 15,
  }));
  const [flour] = await must(sb.from("vyron_cost_ingredients").insert({ company_id: C, ingredient_name: "QA Flour", purchase_unit: "kg", recipe_unit: "kg", purchase_cost: 20, true_unit_cost: 20 }).select("id"));
  const [product] = await must(sb.from("vyron_cost_products").insert({ company_id: C, product_name: "QA Pie", sku: "QA-PIE", selling_price: 20, total_cost: 8, status: "Active", product_status: "Active" }).select("id"));
  const [emptyProduct] = await must(sb.from("vyron_cost_products").insert({ company_id: C, product_name: "QA Empty Pie", selling_price: 20, total_cost: 8, status: "Active", product_status: "Active" }).select("id"));
  const [bom] = await must(sb.from("vyron_cost_boms").insert({ company_id: C, bom_name: "QA Pie", product_id: product.id, yield_qty: 10, status: "Approved", bom_purpose: "Finished Good" }).select("id"));
  await must(sb.from("vyron_cost_bom_lines").insert({ company_id: C, bom_id: bom.id, ingredient_id: flour.id, line_name: "QA Flour", line_type: "Ingredient", quantity: 2, unit: "kg", unit_cost: 20 }));
  await must(sb.from("vyron_cost_boms").insert({ company_id: C, bom_name: "QA Empty Pie", product_id: emptyProduct.id, yield_qty: 1, status: "Approved", bom_purpose: "Finished Good", total_cost: 5 }));

  /* ======================================================= R5 GRN approval */
  console.log("GRN approval");
  const mkPo = async (no) => {
    const [po] = await must(sb.from("vyron_cost_purchase_orders").insert({ company_id: C, po_number: no, status: "Approved", supplier_name_snapshot: "QA Mills" }).select("id"));
    const [pl] = await must(sb.from("vyron_cost_purchase_order_lines").insert({
      company_id: C, purchase_order_id: po.id, item_name: "QA Flour", item_type: "ingredient", item_id: flour.id, ingredient_id: flour.id,
      quantity: 100, ordered_qty: 100, unit: "kg", unit_price: 20, unit_cost: 20, received_qty: 0, damaged_qty: 0, rejected_qty: 0, outstanding_qty: 100,
    }).select("id"));
    return { poId: po.id, lineId: pl.id };
  };
  const grnInput = (po, qty, extra = {}) => ({
    purchase_order_id: po.poId, receipt_type: "partial", received_by: "Dock 1",
    lines: [{ purchase_order_line_id: po.lineId, item_name: "QA Flour", ordered_qty: 100, received_qty: qty, damaged_qty: 0, rejected_qty: 0, unit: "kg", ...extra }],
  });
  const ledgerCount = async (grnId) =>
    (await must(sb.from("vyron_cost_stock_ledger").select("id").eq("company_id", C).eq("reference_id", grnId))).length;

  const po1 = await mkPo("QA-PO-1");
  const off = await createGoodsReceipt(sb, C, grnInput(po1, 5), RECEIVER.name, { userId: RECEIVER.id });
  check("approval OFF (default): GRN posts immediately as before", off.grn.status === "Posted" && off.pendingApproval === false);
  check("approval OFF: stock posted once", (await ledgerCount(off.grn.id)) === 1);

  await grnApproval.setGrnApprovalRequired(sb, C, true, "QA Admin");
  const po2 = await mkPo("QA-PO-2");
  const pend = await createGoodsReceipt(sb, C, grnInput(po2, 10), RECEIVER.name, { userId: RECEIVER.id });
  check("approval ON: GRN saved as Pending Approval", pend.grn.status === "Pending Approval" && pend.pendingApproval === true);
  check("pending GRN posts NO stock", (await ledgerCount(pend.grn.id)) === 0);
  const poLine = async (id) => (await must(sb.from("vyron_cost_purchase_order_lines").select("received_qty, outstanding_qty").eq("id", id)))[0];
  check("pending GRN does not change the PO", Number((await poLine(po2.lineId)).received_qty) === 0);
  let overErr = null;
  try { await createGoodsReceipt(sb, C, grnInput(po2, 95), RECEIVER.name, { userId: RECEIVER.id }); } catch (e) { overErr = e.message; }
  check("second GRN cannot over-receive past the pending one", /outstanding after other GRNs awaiting approval/.test(String(overErr)), overErr);

  const list = await grnApproval.listPendingGrnApprovals(sb, C, APPROVER.userId);
  const item = list.find((g) => g.id === pend.grn.id);
  check("dashboard list shows the pending GRN with PO, lines, value, submitter", item && item.poNumber === "QA-PO-2" && item.lineCount === 1 && item.totalValue === 200 && item.submittedBy === RECEIVER.name);

  let selfErr = null;
  try { await grnApproval.approveGoodsReceipt(sb, C, pend.grn.id, { userId: RECEIVER.id, name: RECEIVER.name }); } catch (e) { selfErr = e.message; }
  check("separation of duties: submitter cannot approve", /separation of duties/.test(String(selfErr)), selfErr);

  const race = await Promise.allSettled([
    grnApproval.approveGoodsReceipt(sb, C, pend.grn.id, APPROVER),
    grnApproval.approveGoodsReceipt(sb, C, pend.grn.id, APPROVER2),
  ]);
  check("two concurrent approvals: exactly one succeeds", race.filter((r) => r.status === "fulfilled").length === 1, JSON.stringify(race.map((r) => r.status)));
  check("stock posted exactly once after concurrent approvals", (await ledgerCount(pend.grn.id)) === 1);
  const approved = (await must(sb.from("vyron_cost_goods_receipts").select("status, approved_by, approved_at").eq("id", pend.grn.id)))[0];
  check("GRN Posted with approver and time recorded", approved.status === "Posted" && !!approved.approved_by && !!approved.approved_at);
  check("PO updated on approval", Number((await poLine(po2.lineId)).received_qty) === 10);
  const audit = await must(sb.from("vyron_procurement_audit_log").select("event_type, actor").eq("company_id", C).eq("entity_id", pend.grn.id));
  check("audit: submitted and approved events, individually", audit.some((a) => a.event_type === "GRN Submitted for Approval") && audit.filter((a) => a.event_type === "GRN Approved").length === 1);

  // Bulk: one clean, one with damaged qty (exception), one already approved, one own.
  const po3 = await mkPo("QA-PO-3");
  const clean = await createGoodsReceipt(sb, C, grnInput(po3, 4), RECEIVER.name, { userId: RECEIVER.id });
  const damaged = await createGoodsReceipt(sb, C, grnInput(po3, 3, { damaged_qty: 1 }), RECEIVER.name, { userId: RECEIVER.id });
  const own = await createGoodsReceipt(sb, C, grnInput(po3, 2), APPROVER.name, { userId: APPROVER.userId });
  const bulk = await grnApproval.bulkApproveGoodsReceipts(sb, C, [clean.grn.id, damaged.grn.id, pend.grn.id, own.grn.id], APPROVER);
  check("bulk: only the clean GRN succeeds", bulk.succeeded.length === 1 && bulk.succeeded[0].id === clean.grn.id, JSON.stringify(bulk.succeeded));
  check("bulk: 3 failures, each with its own reason", bulk.failed.length === 3 && bulk.failed.every((f) => f.error && f.grnNumber));
  check("bulk: exception GRN refused, not silently approved", /exceptions/.test(bulk.failed.find((f) => f.id === damaged.grn.id)?.error || ""));
  check("bulk: already-approved GRN refused (no duplicate approval)", /already approved/.test(bulk.failed.find((f) => f.id === pend.grn.id)?.error || ""));
  check("bulk: own GRN refused", /separation of duties/.test(bulk.failed.find((f) => f.id === own.grn.id)?.error || ""));
  check("approved GRN still posted once", (await ledgerCount(pend.grn.id)) === 1);
  const ack = await grnApproval.approveGoodsReceipt(sb, C, damaged.grn.id, APPROVER, { acknowledgeExceptions: true });
  check("exception GRN approved individually with acknowledgement", ack.ok);
  const rej = await grnApproval.rejectGoodsReceipt(sb, C, own.grn.id, APPROVER2, "Wrong delivery note");
  check("reject: Pending -> Rejected, no stock", rej.status === "Rejected" && (await ledgerCount(own.grn.id)) === 0);
  let rejApprove = null;
  try { await grnApproval.approveGoodsReceipt(sb, C, own.grn.id, APPROVER); } catch (e) { rejApprove = e.message; }
  check("rejected GRN cannot be approved", /rejected/.test(String(rejApprove)), rejApprove);
  let offWhilePending = null;
  await createGoodsReceipt(sb, C, grnInput(await mkPo("QA-PO-4"), 1), RECEIVER.name, { userId: RECEIVER.id });
  try { await grnApproval.setGrnApprovalRequired(sb, C, false, "QA Admin"); } catch (e) { offWhilePending = e.message; }
  check("approval cannot be switched off while GRNs are pending", /awaiting approval/.test(String(offWhilePending)), offWhilePending);

  /* ================================================== R6 invoice numbering */
  console.log("Invoice numbering");
  const line = [{ productId: product.id, productName: "QA Pie", quantity: 2, sellingPrice: 20, costPerUnit: 8 }];
  const inv = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  check("new invoice is a Draft with a DRAFT- reference", inv.status === "Draft" && /^DRAFT-/.test(inv.invoice_number), inv.invoice_number);
  let issued;
  try {
    issued = await invoices.updateCustomerInvoiceStatus(sb, inv.id, "Approved", C, "Ivy Issuer");
  } catch (e) {
    console.log("    (issue error)", e.message);
  }
  check("issuing assigns INV-000001", issued?.invoice_number === "INV-000001" && issued?.status === "Approved", issued?.invoice_number);
  check("issued by + draft reference recorded", issued?.number_issued_by === "Ivy Issuer" && /^DRAFT-/.test(issued?.draft_reference || ""));
  const inv2 = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  const sent2 = await invoices.updateCustomerInvoiceStatus(sb, inv2.id, "Sent", C, "Ivy Issuer");
  check("next issue (straight to Sent) gets INV-000002", sent2.invoice_number === "INV-000002", sent2.invoice_number);
  let delErr = null;
  try { await invoices.deleteCustomerInvoice(sb, C, inv.id); } catch (e) { delErr = e.message; }
  check("issued invoice cannot be deleted", /cannot be deleted/.test(String(delErr)), delErr);
  const cancelled = await invoices.updateCustomerInvoiceStatus(sb, inv.id, "Cancelled", C, "Ivy Issuer");
  check("cancelled invoice keeps INV-000001", cancelled.invoice_number === "INV-000001" && cancelled.status === "Cancelled");
  const cAudit = await must(sb.from("vyron_inventory_audit_log").select("event_type").eq("company_id", C).eq("reference_id", inv.id).eq("event_type", "customer_invoice_cancelled"));
  check("cancellation audited", cAudit.length === 1);
  const draft3 = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  await invoices.deleteCustomerInvoice(sb, C, draft3.id);
  const inv4 = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
  const i4 = await invoices.updateCustomerInvoiceStatus(sb, inv4.id, "Approved", C, "Ivy Issuer");
  check("a deleted draft consumed no number: next is INV-000003", i4.invoice_number === "INV-000003", i4.invoice_number);
  const parallel = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const d = await invoices.createCustomerInvoice(sb, C, { customerName: "Walk-in", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true });
      return (await invoices.updateCustomerInvoiceStatus(sb, d.id, "Approved", C, "Ivy Issuer")).invoice_number;
    })
  );
  check("8 users issuing at once: 8 distinct numbers INV-000004..011", new Set(parallel).size === 8 && [...parallel].sort()[0] === "INV-000004" && [...parallel].sort()[7] === "INV-000011", parallel.sort().join(","));
  const ext = await invoices.createCustomerInvoice(sb, C, { customerName: "Web", invoiceNumber: "WC-1001-abc123", lines: line, useSuppliedLineValues: true, trustSuppliedCost: true, source: { channel: "WOOCOMMERCE", reference: "1001" } });
  const extIssued = await invoices.updateCustomerInvoiceStatus(sb, ext.id, "Approved", C, "sync");
  check("online-store number is kept (external series)", extIssued.invoice_number === "WC-1001-abc123");

  /* ======================================================== R2 job cards */
  console.log("Job cards");
  const [so] = await must(sb.from("vyron_customer_sales_orders").insert({ company_id: C, order_number: "QA-SO-1", customer_name: "Sunrise Deli", status: "Approved", requested_delivery_date: "2026-11-28", notes: "No sesame" }).select("id"));
  await must(sb.from("vyron_customer_sales_order_lines").insert([
    { company_id: C, sales_order_id: so.id, product_id: product.id, description: "QA Pie", quantity: 50, unit: "each", selling_price: 20, sort_order: 0 },
    { company_id: C, sales_order_id: so.id, product_id: emptyProduct.id, description: "QA Empty Pie", quantity: 5, unit: "each", selling_price: 20, sort_order: 1 },
  ]));
  const [draftSo] = await must(sb.from("vyron_customer_sales_orders").insert({ company_id: C, order_number: "QA-SO-2", customer_name: "X", status: "Draft" }).select("id"));
  const soBefore = await must(sb.from("vyron_customer_sales_order_lines").select("quantity").eq("sales_order_id", so.id));
  const built = await jobCards.buildJobCardDocuments(sb, C, "customer_sales_order", [so.id, draftSo.id], "QA Printer");
  check("eligible order gets a card, draft order skipped with reason", built.documents.length === 1 && built.skipped.length === 1 && /Draft/.test(built.skipped[0].reason));
  const doc1 = built.documents[0];
  check("card numbered JC-000001, Awaiting Production", doc1.card.jobCardNumber === "JC-000001" && doc1.card.status === "Awaiting Production");
  const pie = doc1.items.find((i) => i.productName === "QA Pie");
  check("ingredients scaled like production: 50 ÷ yield 10 × 2 kg = 10 kg", pie.ingredients?.[0]?.quantity === 10 && pie.ingredients[0].unit === "kg", JSON.stringify(pie.ingredients));
  const empty = doc1.items.find((i) => i.productName === "QA Empty Pie");
  check("empty BOM: no ingredients invented, warning given", empty.ingredients === null && /No usable BOM/.test(empty.bomWarning || ""));
  const again = await jobCards.buildJobCardDocuments(sb, C, "customer_sales_order", [so.id], "QA Printer");
  check("reprint keeps the same job card number", again.documents[0].card.jobCardNumber === "JC-000001");
  const soAfter = await must(sb.from("vyron_customer_sales_order_lines").select("quantity").eq("sales_order_id", so.id));
  check("printing changed no order quantity", JSON.stringify(soBefore) === JSON.stringify(soAfter));
  const soCount = (await must(sb.from("vyron_customer_sales_orders").select("id").eq("company_id", C))).length;
  check("printing created no order", soCount === 2);
  const st = await jobCards.setJobCardStatus(sb, C, doc1.card.id, "In Production", "QA Supervisor");
  check("job card status change", st.status === "In Production");

  /* ===================================================== R1 BOM overrides */
  console.log("BOM overrides");
  const actor = { id: "user-ov", name: "Olga Override" };
  const created = await overrides.createBomCompletenessOverride(sb, C, actor, { productId: emptyProduct.id, reason: "Checked with production, valid for ops" });
  const rep = await getBomCompletenessReport(sb, C);
  const er = rep.rows.find((r) => r.productId === emptyProduct.id);
  check("override recorded against server-derived status", created.originalStatus === "EMPTY BOM" && er.classification === "OVERRIDDEN" && er.bomStatus === "EMPTY BOM");
  const bomAfter = await must(sb.from("vyron_cost_bom_lines").select("id").eq("company_id", C));
  check("BOM data unchanged by override", bomAfter.length === 1);
  let complete = null;
  try { await overrides.createBomCompletenessOverride(sb, C, actor, { productId: product.id, reason: "Trying to override a complete BOM" }); } catch (e) { complete = e.message; }
  check("complete BOM cannot be overridden", /already system-verified complete/.test(String(complete)), complete);
  await overrides.removeBomCompletenessOverride(sb, C, actor, { overrideId: created.id, reason: "Re-check needed" });
  const rep2 = await getBomCompletenessReport(sb, C);
  check("removal: back to system classification", rep2.rows.find((r) => r.productId === emptyProduct.id).classification === "INCOMPLETE");
  const ovAudit = await must(sb.from("vyron_inventory_audit_log").select("event_type").eq("company_id", C).eq("reference_id", created.id));
  check("override add + remove both audited", ovAudit.length === 2);

  /* ============================================== R3 production control */
  console.log("Production control");
  const [run] = await must(sb.from("vyron_cost_production_runs").insert({ company_id: C, run_number: "QA-PR-1", product_id: product.id, product_name_snapshot: "QA Pie", bom_id: bom.id, bom_name_snapshot: "QA Pie", status: "Approved", planned_qty: 30, actual_qty: 30 }).select("id"));
  await must(sb.from("vyron_cost_production_run_lines").insert({ company_id: C, production_run_id: run.id, line_type: "Ingredient", ingredient_id: flour.id, line_name: "QA Flour", unit: "kg", planned_qty: 1000, unit_cost: 20 }));
  await updateProductionRunControl(sb, C, run.id, { planned_date: "2026-11-25", due_date: "2026-11-26", priority: "High", responsible_person: "Sipho" }, "QA Planner");
  const pcr = await getProductionControlReport(sb, C, { from: "2026-11-25", to: "2026-11-25", view: "daily", today: "2026-11-25" });
  const pj = pcr.jobs.find((j) => j.id === run.id);
  check("report reads captured schedule fields", pj && pj.scheduleSource === "planned" && pj.priority === "High" && pj.responsible === "Sipho");
  check("material shortage detected against real stock", pj.materialStatus === "Short" && pj.materials[0].shortage > 0, JSON.stringify(pj?.materials));
  const runAfter = (await must(sb.from("vyron_cost_production_runs").select("planned_qty, original_planned_date").eq("id", run.id)))[0];
  check("planned qty untouched; original planned date kept", Number(runAfter.planned_qty) === 30 && runAfter.original_planned_date === "2026-11-25");
  await updateProductionRunControl(sb, C, run.id, { planned_date: "2026-11-27" }, "QA Planner");
  const runRes = (await must(sb.from("vyron_cost_production_runs").select("planned_date, original_planned_date").eq("id", run.id)))[0];
  check("reschedule keeps the original issued date", runRes.planned_date === "2026-11-27" && runRes.original_planned_date === "2026-11-25");
} catch (err) {
  fail++;
  console.log("  FAIL unexpected error —", err?.stack || err);
} finally {
  /* ---------------------------------------------------------- clean up */
  const tables = [
    "vyron_cost_stock_ledger", "vyron_inventory_audit_log", "vyron_procurement_audit_log", "vyron_cost_back_orders",
    "vyron_cost_goods_receipt_lines", "vyron_cost_goods_receipts", "vyron_cost_purchase_order_lines", "vyron_cost_purchase_orders",
    "vyron_cost_stock_items", "vyron_grn_approval_settings", "vyron_customer_invoice_lines", "vyron_document_number_register",
    "vyron_document_sequences", "vyron_production_job_cards", "vyron_customer_sales_order_lines", "vyron_customer_sales_orders",
    "vyron_bom_completeness_overrides", "vyron_cost_production_audit_log", "vyron_cost_production_run_lines", "vyron_cost_production_runs",
    "vyron_cost_bom_lines", "vyron_cost_boms", "vyron_cost_products", "vyron_cost_ingredients", "vyron_procurement_three_way_matches",
  ];
  const invIds = (await sb.from("vyron_customer_invoices").select("id").eq("company_id", C)).data?.map((r) => r.id) || [];
  if (invIds.length) await sb.from("vyron_customer_invoice_lines").delete().in("invoice_id", invIds);
  for (const t of tables) await sb.from(t).delete().eq("company_id", C);
  await sb.from("vyron_customer_invoices").delete().eq("company_id", C);
  await sb.from("vyron_workspaces").delete().eq("company_id", C);
  await sb.from("vyron_cost_companies").delete().eq("id", C);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
