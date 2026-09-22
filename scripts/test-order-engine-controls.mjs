#!/usr/bin/env node
/**
 * VYRON Order Engine — controls regression.
 *
 * Standing mappings (aliases, customer identities: recorded, used exactly,
 * never merged, revocable), customer order policies (all rules off unless
 * set), notifications (off by default, never break an action), telemetry (no
 * personal or commercial data in logs), cost redaction, the Exception Centre,
 * inbox filters and paging, CSV hardening, and the WooCommerce / Shopify
 * mapping review. Fictional tenant; in-memory database.
 *
 *   node scripts/test-order-engine-controls.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-order-engine-controls";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};
const rejects = (p) => p.then(() => null, (e) => e);
const section = (t) => console.log(`\n${t}`);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const fixtures = await importFromRoot("src/lib/order-engine/demo/fixtures.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const policies = await importFromRoot("src/lib/order-engine/policies.ts");
const notifications = await importFromRoot("src/lib/order-engine/notifications.ts");
const telemetry = await importFromRoot("src/lib/order-engine/telemetry.ts");
const redaction = await importFromRoot("src/lib/order-engine/redaction.ts");
const sources = await importFromRoot("src/lib/order-engine/sources.ts");
const { ISSUE_CATALOG } = await importFromRoot("src/lib/order-engine/issue-catalog.ts");
const { parseCsvOrder } = await importFromRoot("src/lib/order-engine/adapters/csv.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const { runValidators } = await importFromRoot("src/lib/order-engine/validation.ts");

const { DEMO_COMPANY_ID: CO, DEMO_TODAY, DEMO_PRODUCTS: P, DEMO_CUSTOMERS: C, DEMO_SCENARIOS, demoSeed } = fixtures;
const CO_B = "b0000000-0000-4000-8000-00000000000b";
const CLERK = { userId: "clerk", name: "Clerk" };
const BOSS = { userId: "manager", name: "Manager" };
const input = (id) => DEMO_SCENARIOS.find((s) => s.id === id).input.candidate;
/**
 * The fictional tenant, with its web stores activated. A store that was never
 * activated cannot hand orders over at all (activation.ts), which is proved on
 * its own below; these scenarios are about what happens after that.
 */
const ACTIVATED_STORES = ["woocommerce:s", "woocommerce:other-store", "shopify:s"];
const db0 = () => {
  const seed = demoSeed();
  const template = seed.vyron_order_channel_settings[0];
  seed.vyron_order_channel_settings.push(
    ...ACTIVATED_STORES.map((key, i) => ({ ...template, id: `ch-extra-${i}`, channel_key: key, label: key }))
  );
  return createFakeSupabase(seed);
};
const validate = (db, id, company = CO) => service.performIntakeAction(db, company, id, "validate", CLERK, { today: DEMO_TODAY });
const receiveValidate = async (db, candidate, company = CO) => validate(db, (await service.receiveOrderCandidate(db, company, candidate, CLERK)).intake.id, company);
const codes = (d) => d.intake.validation.issues.map((i) => i.code);

// ---------------------------------------------------------------------------
section("Approved product aliases");
{
  const db = db0();
  const d = await receiveValidate(db, input("unmatched-sku"));
  const line = d.lines[0];
  const noPermission = await rejects(service.editIntake(db, CO, d.intake.id, { resolveLines: [{ lineId: line.id, productId: P.beefPie.id, remember: true }] }, CLERK));
  check("remembering needs approver permission", noPermission?.code === "INVALID_INPUT" && db.tables.vyron_order_product_aliases.length === 0);
  const resolved = await service.editIntake(db, CO, d.intake.id, { resolveLines: [{ lineId: line.id, productId: P.beefPie.id, remember: true }] }, BOSS, { canRemember: true });
  const alias = db.tables.vyron_order_product_aliases[0];
  check("alias recorded for this customer and code", alias?.customer_id === C.bayStreet.id && alias.source_code_normalized === "sku:HK-PIE-LAMB" && alias.product_id === P.beefPie.id && alias.created_by === BOSS.userId);
  check("resolution event names who resolved it", resolved.events.some((e) => e.event_type === "LINE_RESOLVED" && e.actor === BOSS.userId && e.metadata.remembered === true));
  const next = await receiveValidate(db, { ...input("unmatched-sku"), customerPoNumber: "BSD-2002" });
  check("the next order from the same customer matches through the alias", next.lines[0].match_rule === "customer_alias" && next.lines[0].product_id === P.beefPie.id && next.intake.status === "AWAITING_APPROVAL");
  const other = await receiveValidate(db, { ...input("unmatched-sku"), customerName: "Northside Grocers", customerPoNumber: "NG-X" });
  check("another customer's order with that code is NOT matched by it", other.lines[0].match_status === "UNMATCHED");
  const clash = await receiveValidate(db, { ...input("unmatched-sku"), customerPoNumber: "BSD-2003" });
  // It matched through the alias; reopen it so the line can be re-resolved.
  await service.performIntakeAction(db, CO, clash.intake.id, "request_changes", BOSS, { reason: "Different product this time" });
  const conflicting = await rejects(
    service.editIntake(db, CO, clash.intake.id, { resolveLines: [{ lineId: clash.lines[0].id, productId: P.chickenPie.id, remember: true }] }, BOSS, { canRemember: true })
  );
  check("re-pointing a live alias is refused (revoke first)", conflicting?.code === "CONFLICT" && db.tables.vyron_order_product_aliases.length === 1);
  const mappings = await service.listStandingMappings(db, CO);
  check("mappings are listed", mappings.length === 1 && mappings[0].kind === "product_alias");
  await service.revokeStandingMapping(db, CO, "product_alias", alias.id, BOSS);
  check("revoked, not deleted", db.tables.vyron_order_product_aliases.length === 1 && db.tables.vyron_order_product_aliases[0].revoked_by === BOSS.userId);
  const afterRevoke = await validate(db, (await service.receiveOrderCandidate(db, CO, { ...input("unmatched-sku"), customerPoNumber: "BSD-2004" }, CLERK)).intake.id);
  check("after revocation the code is unmatched again", afterRevoke.lines[0].match_status === "UNMATCHED");
  const twice = await rejects(service.revokeStandingMapping(db, CO, "product_alias", alias.id, BOSS));
  check("a mapping is revoked once", twice?.code === "NOT_FOUND");
  const foreign = await rejects(service.revokeStandingMapping(db, CO_B, "product_alias", alias.id, BOSS));
  check("another tenant cannot revoke it", foreign?.code === "NOT_FOUND");
  const noCustomer = await receiveValidate(db, { ...input("unmatched-sku"), customerName: "Nobody" });
  const needCustomer = await rejects(
    service.editIntake(db, CO, noCustomer.intake.id, { resolveLines: [{ lineId: noCustomer.lines[0].id, productId: P.beefPie.id, remember: true }] }, BOSS, { canRemember: true })
  );
  check("an alias needs an identified customer (no company-wide guess)", needCustomer?.code === "INVALID_INPUT");
  // Precedence: this customer's alias for a code that is ALSO a real VYRON SKU wins for them only.
  const precedence = db0();
  precedence.tables.vyron_order_product_aliases.push({ id: "al-x", company_id: CO, customer_id: C.bayStreet.id, source_code: "HK-SOUP-TOM", source_code_normalized: "sku:HK-SOUP-TOM", product_id: P.quiche.id, created_by: "manager", created_at: "2026-09-01T00:00:00Z", revoked_at: null });
  const forBay = await receiveValidate(precedence, { ...input("simple-valid"), customerPoNumber: "P-1", lines: [{ sku: "HK-SOUP-TOM", quantity: 1, unitPrice: 32 }] });
  const forNorth = await receiveValidate(precedence, { ...input("simple-valid"), customerName: "Northside Grocers", customerPoNumber: "P-2", lines: [{ sku: "HK-SOUP-TOM", quantity: 1, unitPrice: 28 }] });
  check("this customer's alias outranks a coincidental SKU…", forBay.lines[0].match_rule === "customer_alias" && forBay.lines[0].product_id === P.quiche.id);
  check("…for that customer only", forNorth.lines[0].match_rule === "sku_exact" && forNorth.lines[0].product_id === P.soup.id);
}

section("Customer identity map (no merging)");
{
  const db = db0();
  const woo = DEMO_SCENARIOS.find((s) => s.id === "woocommerce-order").input;
  const payload = { ...woo.order, id: 1, customer_id: 4242, billing: { company: "", first_name: "", last_name: "", email: "someone@else.example" } };
  const d = await receiveValidate(db, platforms.normalizeWooCommerceOrder({ storeKey: "demo-web", order: payload }));
  check("an unknown web customer is an exception, not a new customer", codes(d).includes("CUSTOMER_NOT_FOUND") && db.tables.vyron_customers.length === 5);
  await service.editIntake(db, CO, d.intake.id, { customerId: C.bayStreet.id, rememberCustomerReference: true }, BOSS, { canRemember: true });
  const identity = db.tables.vyron_order_customer_identities[0];
  check("the reference is remembered for its source", identity?.source === "woocommerce" && identity.external_reference_normalized === "woocommerce:demo-web:customer:4242" && identity.customer_id === C.bayStreet.id);
  const again = await receiveValidate(db, platforms.normalizeWooCommerceOrder({ storeKey: "demo-web", order: { ...payload, id: 2 } }));
  check("the next order from that web customer resolves through the map", again.intake.customer_id === C.bayStreet.id && again.intake.customer_match_rule === "identity_map");
  const otherStore = await receiveValidate(db, platforms.normalizeWooCommerceOrder({ storeKey: "other-store", order: { ...payload, id: 3 } }));
  check("the same customer id from another store is NOT resolved by it", codes(otherStore).includes("CUSTOMER_NOT_FOUND"));
  const repoint = await receiveValidate(db, platforms.normalizeWooCommerceOrder({ storeKey: "demo-web", order: { ...payload, id: 4 } }));
  await service.performIntakeAction(db, CO, repoint.intake.id, "request_changes", BOSS, { reason: "Check customer" });
  const clash = await rejects(service.editIntake(db, CO, repoint.intake.id, { customerId: C.northside.id, rememberCustomerReference: true }, BOSS, { canRemember: true }));
  check("re-pointing a reference to another customer is refused (would merge histories)", clash?.code === "CONFLICT");
  const byEmailOnly = await receiveValidate(db, { source: "email", sourceKey: "m1#po.csv", customerReference: "buying@baystreetdeli.example", senderEmail: "buying@baystreetdeli.example", lines: [{ sku: "HK-SOUP-TOM", quantity: 12, unitPrice: 28 }] });
  check("e-mail identifies only with a review warning", byEmailOnly.intake.customer_id === C.bayStreet.id && codes(byEmailOnly).includes("CUSTOMER_MATCHED_BY_EMAIL"));
  const db2 = db0();
  db2.tables.vyron_customers.push({ id: "dup-email", company_id: CO, customer_name: "Bay Street Deli (Branch 2)", email: "BUYING@baystreetdeli.example", status: "Active" });
  const shared = await receiveValidate(db2, { source: "email", sourceKey: "m2#po.csv", customerReference: "buying@baystreetdeli.example", senderEmail: "buying@baystreetdeli.example", lines: [{ sku: "HK-SOUP-TOM", quantity: 12, unitPrice: 28 }] });
  check("an e-mail shared by two customers is ambiguous — never merged", codes(shared).includes("CUSTOMER_AMBIGUOUS") && !shared.intake.customer_id);
  const sameName = db0();
  sameName.tables.vyron_customers.push({ id: "twin", company_id: CO, customer_name: "BAY  STREET deli", status: "Active" });
  const twin = await receiveValidate(sameName, input("simple-valid"));
  check("two customers with the same normalised name are ambiguous — never merged", codes(twin).includes("CUSTOMER_AMBIGUOUS"));
}

section("Customer order policies (off unless set)");
{
  const db = db0();
  db.tables.vyron_customer_order_policies = [];
  const noPolicy = await receiveValidate(db, { ...input("simple-valid"), customerName: "Lighthouse Hotel", customerPoNumber: null, requestedDeliveryDate: "2026-10-06" });
  check("with no policy, no policy rule fires", !codes(noPolicy).some((c) => ISSUE_CATALOG[c]?.source === "policy"), JSON.stringify(codes(noPolicy)));
  const saved = await policies.saveOrderPolicy(db, CO, null, { requirePo: true }, BOSS);
  check("a company default policy can be saved", saved.customer_id === null && saved.require_po === true && saved.updated_by === BOSS.userId);
  const withDefault = await receiveValidate(db, { ...input("simple-valid"), customerPoNumber: null });
  check("the company default applies to customers without their own", codes(withDefault).includes("MISSING_PO") && withDefault.intake.validation.policy?.scope === "company");
  await policies.saveOrderPolicy(db, CO, C.bayStreet.id, { requirePo: false, minOrderValue: 5000 }, BOSS);
  const own = await receiveValidate(db, { ...input("simple-valid"), customerPoNumber: null });
  check("a customer's own policy replaces the default", !codes(own).includes("MISSING_PO") && codes(own).includes("BELOW_MINIMUM_ORDER") && own.intake.validation.policy?.scope === "customer");
  await policies.saveOrderPolicy(db, CO, C.bayStreet.id, { requirePo: false }, BOSS);
  check("saving again updates in place (one policy per customer)", db.tables.vyron_customer_order_policies.filter((p) => p.customer_id === C.bayStreet.id).length === 1);
  const badDays = await rejects(policies.saveOrderPolicy(db, CO, null, { deliveryWeekdays: [0, 8] }, BOSS));
  check("delivery days are validated", badDays?.code === "INVALID_INPUT");
  const badCutoff = await rejects(policies.saveOrderPolicy(db, CO, null, { orderCutoffTime: "25:00" }, BOSS));
  check("cut-off time is validated", badCutoff?.code === "INVALID_INPUT");
  const foreign = await rejects(policies.saveOrderPolicy(db, CO_B, C.bayStreet.id, { requirePo: true }, BOSS));
  check("a policy cannot be set for another tenant's customer", foreign?.code === "INVALID_INPUT");
  const provisional = db0();
  provisional.tables.vyron_cost_product_pack_sizes[0].confidence = "Provisional";
  const p = await receiveValidate(provisional, { ...input("simple-valid"), customerName: "Lighthouse Hotel", customerPoNumber: "LH-1", requestedDeliveryDate: "2026-10-05", lines: [{ sku: "HK-SOUP-TOM", quantity: 30, unitPrice: 28 }] });
  check("a provisional pack size is not enforced as a rule", !codes(p).includes("CASE_QUANTITY"), JSON.stringify(codes(p)));
}

section("Notifications: off by default, never break an action");
{
  const db = db0();
  notifications.configureOrderIntakeNotifier(null);
  check("the default notifier is disabled", notifications.currentOrderIntakeNotifier().enabled === false);
  const recorder = notifications.createRecordingNotifier();
  notifications.configureOrderIntakeNotifier(recorder);
  const d = await receiveValidate(db, input("simple-valid"));
  await service.performIntakeAction(db, CO, d.intake.id, "approve", BOSS, { today: DEMO_TODAY, validationHash: d.intake.validation_hash });
  const events = recorder.sent.map((n) => n.event);
  check("received, approval-required, approved and confirmed are emitted", ["ORDER_RECEIVED", "APPROVAL_REQUIRED", "ORDER_APPROVED", "ORDER_CONFIRMED"].every((e) => events.includes(e)), events.join(","));
  const allowed = new Set(["event", "companyId", "intakeId", "intakeNumber", "source", "status", "blockingIssues", "warnings", "salesOrderNumber", "at"]);
  check("notifications carry identifiers and counts only — no names, lines or prices", recorder.sent.every((n) => Object.keys(n).every((k) => allowed.has(k)) && !JSON.stringify(n).includes("Bay Street")));
  const exception = await receiveValidate(db, input("unmatched-sku"));
  check("an exception is emitted", recorder.sent.some((n) => n.event === "ORDER_EXCEPTION" && n.intakeId === exception.intake.id));
  notifications.configureOrderIntakeNotifier({ enabled: true, notify: async () => { throw new Error("mail server down"); } });
  const survived = await receiveValidate(db, { ...input("simple-valid"), customerPoNumber: "BSD-N" });
  check("a failing notifier does not break the action", survived.intake.status === "AWAITING_APPROVAL");
  notifications.configureOrderIntakeNotifier(null);
  check("ORDER_REJECTED and ORDER_ON_HOLD are part of the event set", ["ORDER_REJECTED", "ORDER_ON_HOLD"].every((e) => notifications.ORDER_INTAKE_EVENTS.includes(e)));
}

section("Telemetry: counts and codes, never personal or commercial data");
{
  const lines = [];
  telemetry.setOrderEngineLogSink((line) => lines.push(line));
  const db = db0();
  const d = await receiveValidate(db, { ...input("simple-valid"), notes: "Call Mrs Smith on 082 555 0100", customerName: "Bay Street Deli" });
  await service.performIntakeAction(db, CO, d.intake.id, "approve", BOSS, { today: DEMO_TODAY, validationHash: d.intake.validation_hash });
  await receiveValidate(db, input("unmatched-sku"));
  telemetry.setOrderEngineLogSink(null);
  const metrics = lines.map((l) => JSON.parse(l).metric);
  check("received, awaiting approval, approved, handoff and exception are logged", ["order.received", "order.awaiting_approval", "order.approved", "order.handoff_succeeded", "order.exception"].every((m) => metrics.includes(m)), metrics.join(","));
  const all = lines.join("\n");
  check("no customer name, note, phone number, e-mail or price in any log line", !/Bay Street|Smith|082 555|@|"38"|unitPrice|price/i.test(all), all.slice(0, 300));
  telemetry.setOrderEngineLogSink((line) => lines.push(line));
  telemetry.recordOrderEngineEvent("order.rejected", { companyId: CO, customerName: "Leaky", email: "x@y.z", reason: "Customer said: cancel it!", codes: ["A;B"] });
  telemetry.setOrderEngineLogSink(null);
  const last = JSON.parse(lines[lines.length - 1]);
  check("non-allow-listed fields are dropped and free text is reduced to a code", !("customerName" in last) && !("email" in last) && last.reason === "Customersaidcancelit" && last.codes[0] === "AB");
}

section("Cost redaction for members who cannot approve");
{
  const db = db0();
  const d = await receiveValidate(db, { ...input("simple-valid"), customerPoNumber: "BSD-R", lines: [{ sku: "HK-GIFT", quantity: 1, unitPrice: 300 }] });
  const redacted = redaction.redactValidation(d.intake.validation, false);
  const neg = redacted.issues.find((i) => i.code === "NEGATIVE_MARGIN");
  check("margin issues keep their code but lose detail", neg && neg.message === "Margin check — visible to approvers." && neg.data === undefined);
  check("line and total costs are removed", redacted.lines.every((l) => l.unitCost === null && l.lineGp === null) && redacted.totals.expectedGp === null);
  check("non-margin issues are untouched", redacted.issues.filter((i) => i.category !== "margin").every((i, k) => i.message === d.intake.validation.issues.filter((x) => x.category !== "margin")[k].message));
  check("approvers see everything", redaction.redactValidation(d.intake.validation, true) === d.intake.validation);
  const meta = redaction.redactEventMetadata({ acknowledgedWarnings: [{ code: "NEGATIVE_MARGIN", message: "sells below cost 390" }, { code: "PRICE_MISMATCH", message: "x" }] }, false);
  check("acknowledged margin warnings in the audit are redacted too", meta.acknowledgedWarnings[0].message === "Margin check — visible to approvers." && meta.acknowledgedWarnings[1].message === "x");
  check("no validation message ever quotes a cost figure", !JSON.stringify(d.intake.validation.issues).includes("390"));
}

section("Exception Centre");
{
  const db = db0();
  await receiveValidate(db, input("multiple-exceptions"));
  await receiveValidate(db, input("warning-only"));
  const withUnmatched = await receiveValidate(db, input("unmatched-sku"));
  await service.editIntake(db, CO, withUnmatched.intake.id, { resolveLines: [{ lineId: withUnmatched.lines[0].id, productId: P.beefPie.id }] }, CLERK);
  const centre = await service.listExceptionCentre(db, CO);
  check("open issues listed with title and required action", centre.open.length > 0 && centre.open.every((r) => r.title && r.action));
  check("blocking issues come first", centre.open.findIndex((r) => !r.blocking) === -1 || centre.open.slice(0, centre.open.findIndex((r) => !r.blocking)).every((r) => r.blocking));
  check("line-level issues name their line", centre.open.some((r) => r.code === "PRODUCT_AMBIGUOUS" && r.lineNo === 1));
  check("warnings are included", centre.open.some((r) => r.code === "CUSTOMER_ON_HOLD" && !r.blocking));
  check("a resolved exception shows who resolved it and when", centre.resolved.some((r) => r.type === "LINE_RESOLVED" && r.resolvedBy === CLERK.userId && r.intakeNumber));
  check("info-level items are not exceptions", centre.open.every((r) => r.severity !== "info"));
  const other = await service.listExceptionCentre(db, CO_B);
  check("tenant isolated", other.open.length === 0 && other.resolved.length === 0);
}

section("Inbox filters and paging");
{
  const db = db0();
  for (const id of ["simple-valid", "unmatched-sku", "wrong-price", "warning-only", "csv-order"]) {
    const s = DEMO_SCENARIOS.find((x) => x.id === id);
    const cand = s.input.kind === "csv" ? parseCsvOrder({ text: s.input.text, fileName: s.input.fileName }) : s.input.candidate;
    await receiveValidate(db, cand);
  }
  const all = await service.listIntakes(db, CO, { view: "all" });
  check("all orders listed", all.rows.length === 5 && all.counts.EXCEPTION === 1);
  const exceptions = await service.listIntakes(db, CO, { view: "exceptions" });
  check("exceptions view", exceptions.rows.length === 1 && exceptions.rows[0].status === "EXCEPTION");
  const csvOnly = await service.listIntakes(db, CO, { view: "all", source: "csv" });
  check("filter by source", csvOnly.rows.length === 1 && csvOnly.rows[0].source === "csv");
  const bySearch = await service.listIntakes(db, CO, { view: "all", search: "BSD-1003" });
  check("search by PO", bySearch.rows.length === 1 && bySearch.rows[0].customer_po_number === "BSD-1003");
  const byName = await service.listIntakes(db, CO, { view: "all", search: "cove" });
  check("search by customer name", byName.rows.length === 1);
  const injection = await service.listIntakes(db, CO, { view: "all", search: "x),status.eq.CONFIRMED,(y" });
  check("filter-grammar characters in a search are neutralised", injection.rows.length === 0 && service.safeSearchTerm("a,b(c)'d%e_f") === "abcde_f");
  const blocking = await service.listIntakes(db, CO, { view: "all", withIssues: "blocking" });
  check("filter orders with blocking issues", blocking.rows.length === 1);
  const page1 = await service.listIntakes(db, CO, { view: "all", limit: 2, offset: 0 });
  const page3 = await service.listIntakes(db, CO, { view: "all", limit: 2, offset: 4 });
  check("paging reports whether there is more", page1.rows.length === 2 && page1.hasMore === true && page3.rows.length === 1 && page3.hasMore === false);
  const bad = await service.listIntakes(db, CO, { view: "nonsense", limit: 99999, offset: -5 });
  check("unknown view falls back to inbox; limits are clamped", bad.limit === 200 && bad.offset === 0);
}

section("CSV hardening");
{
  const good = "customer,po_number,sku,description,quantity,unit_price\nBay Street Deli,PO-9,HK-PIE-BEEF,\"Beef, Ale & Onion\",12.5,38\n";
  const c = parseCsvOrder({ text: good, fileName: "a.csv" });
  check("quoted text with a comma", c.lines[0].description === "Beef, Ale & Onion");
  check("decimal quantity accepted (validation decides)", c.lines[0].quantity === 12.5);
  const reordered = parseCsvOrder({ text: "unit_price,quantity,description,sku,po_number,customer\n38,12,Beef,HK-PIE-BEEF,PO-9,Bay Street Deli\n" });
  check("columns in any order", reordered.lines[0].sku === "HK-PIE-BEEF" && reordered.lines[0].unitPrice === 38 && reordered.customerPoNumber === "PO-9");
  const extra = parseCsvOrder({ text: "sku,qty,colour,warehouse_note\nHK-PIE-BEEF,1,red,x\n" });
  check("extra columns are ignored, never guessed at", extra.lines.length === 1 && !("colour" in extra.lines[0]));
  const blanks = parseCsvOrder({ text: "sku,qty\n\nHK-PIE-BEEF,1\n,\n\nHK-SOUP-TOM,2\n" });
  check("blank rows skipped", blanks.lines.length === 2);
  const bom = parseCsvOrder({ text: "﻿sku,qty\r\nHK-PIE-BEEF,1\r\n" });
  check("UTF-8 byte-order mark and CRLF", bom.lines[0].sku === "HK-PIE-BEEF");
  const unicode = parseCsvOrder({ text: "customer,sku,description,qty\nCafé Ñandú,HK-SOUP-TOM,Soupe à la tomate — 500ml,2\n" });
  check("UTF-8 names preserved", unicode.customerName === "Café Ñandú" && unicode.lines[0].description.includes("à la tomate"));
  const semicolon = parseCsvOrder({ text: "sku;qty;price\nHK-PIE-BEEF;3;38\n" });
  check("semicolon-delimited files", semicolon.lines[0].quantity === 3 && semicolon.lines[0].unitPrice === 38);
  const dupLines = parseCsvOrder({ text: "sku,qty,line_ref\nA,1,L1\nB,1,L2\n" });
  check("line references from the file", dupLines.lines.map((l) => l.sourceLineReference).join() === "L1,L2");
  const failures_ = [
    ["missing headers", "HK-PIE-BEEF,1\n"],
    ["no quantity column", "sku,description\nX,Y\n"],
    ["invalid quantity", "sku,qty\nX,twelve\n"],
    ["invalid price", "sku,qty,price\nX,1,abc\n"],
    ["two customers in one file", "customer,sku,qty\nA,X,1\nB,Y,1\n"],
    ["two POs in one file", "po_number,sku,qty\nP1,X,1\nP2,Y,1\n"],
    ["two orders in one file", "order_number,sku,qty\n1,X,1\n2,Y,1\n"],
    ["empty file", ""],
    ["header only", "sku,qty\n"],
    ["locale date", "sku,qty,delivery_date\nX,1,01/10/2026\n"],
  ];
  for (const [label, text] of failures_) {
    const err = await rejects(Promise.resolve().then(() => parseCsvOrder({ text })));
    check(`refused whole (no partial import): ${label}`, err && err.name === "OrderSourceParseError", err?.message);
  }
  const big = "sku,qty\n" + "HK-PIE-BEEF,1\n".repeat(160_000);
  const tooBig = await rejects(Promise.resolve().then(() => parseCsvOrder({ text: big })));
  check("files over 2 MB refused", tooBig && /2 MB/.test(tooBig.message));
  const injected = parseCsvOrder({ text: "sku,description,qty\nX,  =cmd|' /C calc'!A0,1\n@SUM,+1+1,1\n" });
  check("formula injection neutralised even behind spaces", injected.lines.every((l) => !/^[=+@-]/.test(String(l.description)) && !/^[=+@]/.test(String(l.sku))), JSON.stringify(injected.lines));
  const db = db0();
  const dupFile = await service.receiveOrderCandidate(db, CO, parseCsvOrder({ text: "customer,sku,qty\nBay Street Deli,HK-PIE-BEEF,1\n" }), CLERK);
  const dupAgain = await service.receiveOrderCandidate(db, CO, parseCsvOrder({ text: "customer,sku,qty\nBay Street Deli,HK-PIE-BEEF,1\n" }), CLERK);
  check("duplicate file is one order", dupAgain.duplicate && dupAgain.intake.id === dupFile.intake.id);
  const otherTenant = await service.receiveOrderCandidate(db, CO_B, parseCsvOrder({ text: "customer,sku,qty\nBay Street Deli,HK-PIE-BEEF,1\n" }), CLERK);
  check("the same file in another tenant is that tenant's own order", !otherTenant.duplicate && otherTenant.intake.company_id === CO_B);
  const unknown = await validate(db, (await service.receiveOrderCandidate(db, CO, parseCsvOrder({ text: "customer,sku,qty\nNobody Ltd,NOPE-1,1\n" }), CLERK)).intake.id);
  check("unknown customer and SKU from CSV become exceptions", codes(unknown).includes("CUSTOMER_NOT_FOUND") && codes(unknown).includes("PRODUCT_UNMATCHED"));
}

section("WooCommerce mapping review");
{
  const base = DEMO_SCENARIOS.find((s) => s.id === "woocommerce-order").input;
  const w = platforms.normalizeWooCommerceOrder({ storeKey: base.storeKey, order: base.order });
  const net = w.lines.reduce((s, l) => s + l.quantity * l.unitPrice - (l.discountAmount || 0), 0);
  check("line net sums to the stated subtotal (discount counted once)", Math.abs(net - w.supplied.subtotal) < 0.005, `${net} vs ${w.supplied.subtotal}`);
  check("coupon discount lives in the lines; codes recorded", w.extraction.sourceFacts.couponCodes[0] === "SPRING10");
  check("line tax recorded as stated", w.lines[0].taxAmount === 10.26);
  check("shipping recorded, not a line", w.supplied.shippingTotal === 65 && w.lines.length === 2);
  check("order total as stated", w.supplied.total === 474.26 && w.supplied.taxTotal === 51.86);
  check("tax basis recorded as stated (false)", w.pricesIncludeTax === false);
  check("sku, name, quantity mapped", w.lines[1].sku === "HK-SOUP-TOM" && w.lines[1].description === "Tomato Soup 500ml" && w.lines[1].quantity === 10);
  check("external id and number", w.sourceKey === "demo-web:order:90211" && w.externalOrderNumber === "90211");
  const refunded = platforms.normalizeWooCommerceOrder({ storeKey: "s", order: { ...base.order, refunds: [{ id: 1, total: "-20.00" }] } });
  check("a partial refund is recorded as a fact", refunded.extraction.sourceFacts.refundedTotal === 20);
  const d = await receiveValidate(db0(), refunded);
  check("…and raised to the approver", codes(d).includes("SOURCE_PARTIAL_REFUND"));
  const incl = platforms.normalizeWooCommerceOrder({ storeKey: "s", order: { ...base.order, prices_include_tax: true } });
  const inclD = await receiveValidate(db0(), incl);
  check("tax-inclusive store prices block approval", codes(inclD).includes("PRICES_INCLUDE_TAX") && inclD.intake.status === "EXCEPTION");
  for (const status of ["cancelled", "refunded", "failed", "trash"]) {
    const err = await rejects(Promise.resolve().then(() => platforms.normalizeWooCommerceOrder({ storeKey: "s", order: { ...base.order, status } })));
    check(`status ${status} refused`, Boolean(err));
  }
  const guest = platforms.normalizeWooCommerceOrder({ storeKey: "s", order: { ...base.order, customer_id: 0 } });
  check("guest checkout keeps the e-mail only as a reference", guest.customerReference === "buying@baystreetdeli.example");
  const qtyString = platforms.normalizeWooCommerceOrder({ storeKey: "s", order: { ...base.order, line_items: [{ id: 9, sku: "X", name: "X", quantity: "3", subtotal: "30.00", total: "30.00" }] } });
  check("string quantities parsed", qtyString.lines[0].quantity === 3 && qtyString.lines[0].unitPrice === 10);
}

section("Shopify mapping review");
{
  const base = DEMO_SCENARIOS.find((s) => s.id === "shopify-order").input;
  const s = platforms.normalizeShopifyOrder({ storeKey: base.storeKey, order: base.order });
  check("order id and name", s.sourceKey === "demo-shop:order:5550001" && s.externalOrderNumber === "#1042");
  check("customer reference, never a customer", s.customerReference === "shopify:demo-shop:customer:881" && !s.customerId && !s.customerName);
  check("taxes_included recorded", s.pricesIncludeTax === true);
  check("currency", s.currency === "ZAR");
  const discounted = platforms.normalizeShopifyOrder({
    storeKey: "s",
    order: { ...base.order, taxes_included: false, line_items: [{ id: 1, sku: "HK-SOUP-TOM", title: "Soup", quantity: 4, price: "28.00", total_discount: "0.00", discount_allocations: [{ amount: "5.00" }, { amount: "3.00" }], tax_lines: [{ price: "15.60" }] }] },
  });
  check("discount allocations summed (not the deprecated total_discount)", discounted.lines[0].discountAmount === 8);
  check("line tax summed from tax lines", discounted.lines[0].taxAmount === 15.6);
  const legacy = platforms.normalizeShopifyOrder({ storeKey: "s", order: { ...base.order, line_items: [{ id: 1, sku: "X", quantity: 1, price: "10.00", total_discount: "2.00" }] } });
  check("older payloads fall back to total_discount", legacy.lines[0].discountAmount === 2);
  const shipping = platforms.normalizeShopifyOrder({ storeKey: "s", order: { ...base.order, total_shipping_price_set: { shop_money: { amount: "80.00" } } } });
  check("shipping recorded from total_shipping_price_set", shipping.supplied.shippingTotal === 80);
  const shippingLines = platforms.normalizeShopifyOrder({ storeKey: "s", order: { ...base.order, shipping_lines: [{ price: "30.00" }, { price: "20.00" }] } });
  check("or from shipping lines", shippingLines.supplied.shippingTotal === 50);
  const partial = platforms.normalizeShopifyOrder({ storeKey: "s", order: { ...base.order, financial_status: "partially_refunded", refunds: [{ id: 1, transactions: [{ amount: "43.70", kind: "refund" }] }] } });
  check("partial refunds recorded", partial.extraction.sourceFacts.refundedTotal === 43.7 && partial.sourceStatus === "partially_refunded");
  for (const [label, order] of [["cancelled", { cancelled_at: "2026-09-01" }], ["refunded", { financial_status: "refunded" }], ["voided", { financial_status: "voided" }]]) {
    const err = await rejects(Promise.resolve().then(() => platforms.normalizeShopifyOrder({ storeKey: "s", order: { ...base.order, ...order } })));
    check(`${label} refused`, Boolean(err));
  }
}

section("Sources and catalogue");
{
  const states = Object.fromEntries(sources.ORDER_SOURCE_REGISTRY.map((s) => [s.source, s.state]));
  check("manual and CSV are READY", states.manual === "READY" && states.csv === "READY");
  check("e-mail, WooCommerce and Shopify are NOT_CONNECTED", states.email === "NOT_CONNECTED" && states.woocommerce === "NOT_CONNECTED" && states.shopify === "NOT_CONNECTED");
  check("Excel and PDF are built but NOT_CONNECTED (no mailbox, no extractor)", ["xlsx", "pdf"].every((k) => states[k] === "NOT_CONNECTED"));
  check("API and EDI are COMING_SOON", ["api", "edi"].every((k) => states[k] === "COMING_SOON"));
  check("the platform adapters declare connected: false", platforms.wooCommerceOrderAdapter.connected === false && platforms.shopifyOrderAdapter.connected === false);
  check("every catalogue entry has an action", Object.values(ISSUE_CATALOG).every((d) => d.action.length > 5));
  const brief = ["UNMATCHED_CUSTOMER", "UNMATCHED_PRODUCT", "AMBIGUOUS_PRODUCT", "DUPLICATE_ORDER", "PAST_DELIVERY_DATE", "INVALID_TOTAL"];
  check("every rule named in the brief maps to a catalogued rule", brief.every((name) => Object.values(ISSUE_CATALOG).some((d) => d.aka?.includes(name))));
  check("PRICE_MISMATCH, INSUFFICIENT_STOCK, PRODUCTION_REQUIRED, LOW_MARGIN, INVALID_QUANTITY, MISSING_PO, MISSING_DELIVERY_DATE exist", ["PRICE_MISMATCH", "INSUFFICIENT_STOCK", "PRODUCTION_REQUIRED", "LOW_MARGIN", "INVALID_QUANTITY", "MISSING_PO", "MISSING_DELIVERY_DATE"].every((c) => c in ISSUE_CATALOG));
}

section("AI / OCR extraction contract");
{
  const ctx = (extraction, lineExtraction = {}) => ({
    intake: { extraction, requested_delivery_date: null, customer_po_number: null, supplied_subtotal: null, prices_include_tax: null, supplied_shipping_total: null },
    customer: { status: "MATCHED", rule: "name_exact", customer: { id: "c", customer_name: "X" }, candidates: [], reason: "" },
    lines: [{ line: { line_no: 1, quantity: 1, unit_price: 10, discount_amount: null, line_total: null, extraction: lineExtraction }, match: { status: "MATCHED", rule: "sku_exact", product: { id: "p", product_name: "P", sku: "S", selling_price: 10, total_cost: 5 }, candidates: [], reason: "" }, expectedPrice: { sellingPrice: 10, source: "product_master", priceListId: null }, priceError: null, stock: null, hasBom: null, unitsPerCase: null }],
    samePoIntakes: [],
    policy: null,
    today: DEMO_TODAY,
  });
  const structured = runValidators(ctx({ method: "structured" }));
  check("structured sources need no extraction review", !structured.issues.some((i) => i.category === "extraction"));
  const ai = runValidators(ctx({ method: "ai", fields: { customer: { confidence: "HIGH", method: "ai", source: "email line 1" } } }));
  check("AI output is always reviewed, even when confident", ai.issues.some((i) => i.code === "EXTRACTION_REVIEW") && ai.counts.errors === 0);
  const low = runValidators(ctx({ method: "ai" }, { method: "ai", fields: { quantity: { confidence: "LOW", method: "ai", source: "email body line 4" } } }));
  const lowIssue = low.issues.find((i) => i.code === "EXTRACTION_LOW_CONFIDENCE");
  check("a low-confidence AI value blocks approval and says where it came from", lowIssue?.severity === "error" && lowIssue.lineNo === 1 && /email body line 4/.test(lowIssue.message));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
