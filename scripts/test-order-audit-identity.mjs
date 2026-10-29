#!/usr/bin/env node
/**
 * VOLORA — who approved, rejected, received or reversed an order is the signed-in
 * member, never a name the browser sends.
 *
 * DEFECTS THIS LOCKS DOWN (2026-10-29)
 * ------------------------------------
 * Purchase order, goods receipt, requisition and store order routes checked the
 * member's permission and then recorded whatever `approvedBy` / `actor` /
 * `created_by` / `completed_by` the request carried ("supervisor", "user", or any
 * colleague's name). Also:
 *   - POST /api/purchase-orders/engine let any editor set ANY status (Approved,
 *     Sent, ...) with only purchase_orders.edit and wrote no audit record.
 *   - POST /api/documents/[id]/link-po found the purchase order by id alone: a
 *     member of one company could link to another company's PO, read its number
 *     and totals, and write a match and audit row into that company.
 *   - System → Settings → Users listed the legacy vyron_cost_users registry
 *     (empty for companies whose members were added after provisioning) instead
 *     of the workspace members User Setup manages.
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data.
 *
 *   npm run test:order-audit-identity
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};
const section = (title) => console.log(`\n${title}`);

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1), CO_EMPTY = uuid("e", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2), WS_EMPTY = uuid("e", 2);
const U_OWNER = uuid("a", 10), U_CLERK = uuid("a", 11), U_SUP = uuid("a", 12), U_SALES = uuid("a", 13), U_DISABLED = uuid("a", 14);
const U_B_OWNER = uuid("b", 10), U_EMPTY_OWNER = uuid("e", 10);
const SPOOF = "Someone Else (spoofed)";

const MEMBERS = [
  // [userId, email, workspace, role, status, first name, surname]
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", "Active", "Synthetic", "Owner"],
  [U_CLERK, "clerk@qa-a.test", WS_A, "PROCUREMENT", "Active", "Synthetic", "Buyer"],
  [U_SUP, "sup@qa-a.test", WS_A, "SUPERVISOR", "Active", "Synthetic", "Supervisor"],
  [U_SALES, "sales@qa-a.test", WS_A, "SALES", "Active", "Synthetic", "Sales"],
  [U_DISABLED, "gone@qa-a.test", WS_A, "PROCUREMENT", "Disabled", "Former", "Member"],
  [U_B_OWNER, "owner@qa-b.test", WS_B, "OWNER", "Active", "Tenant B", "Owner"],
  [U_EMPTY_OWNER, "owner@qa-e.test", WS_EMPTY, "OWNER", "Active", "Empty", "Owner"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));
const profile = ([id, email, , , , first_name, surname]) => ({ id, email, first_name, surname, mobile: "" });

const po = (id, company, number, status, total) => ({
  id, company_id: company, po_number: number, supplier_id: null, supplier_name_snapshot: "QA Supplier", status,
  order_date: "2026-10-20", subtotal: total, vat_amount: 0, total, expected_total: total, outstanding_amount: total,
  created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-20T08:00:00Z",
});
const storeOrder = (id, company, number, status) => ({
  id, company_id: company, store_id: `store-${company.slice(0, 1)}`, order_number: number, status,
  order_date: "2026-10-20", required_date: "2026-10-22", created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-20T08:00:00Z",
});

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Full", status: "Setup", user_limit: 10 },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Full", status: "Setup", user_limit: 10 },
      { id: WS_EMPTY, company_id: CO_EMPTY, company_name: "QA Empty Tenant", package_name: "Full", status: "Setup", user_limit: 10 },
    ],
    // PostgREST returns the embedded profile nested on each membership; the fake has no joins.
    vyron_workspace_memberships: MEMBERS.map((m, i) => ({
      id: `m${i}`, workspace_id: m[2], user_id: m[0], role: m[3], status: m[4], permissions: {},
      created_at: `2026-10-0${(i % 9) + 1}T08:00:00Z`, joined_at: null, vyron_user_profiles: profile(m),
    })),
    vyron_user_profiles: MEMBERS.map(profile),
    // The legacy registry: empty, exactly as it is for Handcrafted in production.
    vyron_cost_users: [],
    vyron_po_approval_rules: [
      { id: "r-a", company_id: CO_A, auto_approve_below: 0, supervisor_approve_below: 25000, require_po_before_invoice_approval: false },
      { id: "r-b", company_id: CO_B, auto_approve_below: 0, supervisor_approve_below: 25000, require_po_before_invoice_approval: false },
    ],
    vyron_cost_purchase_orders: [
      po("po-a1", CO_A, "PO-A1", "Submitted", 1000),
      po("po-a2", CO_A, "PO-A2", "Submitted", 1000),
      po("po-a3", CO_A, "PO-A3", "Approved", 1000),
      po("po-b1", CO_B, "PO-B1", "Submitted", 5000),
    ],
    vyron_cost_purchase_order_lines: [],
    vyron_procurement_audit_log: [],
    vyron_cost_goods_receipts: [],
    vyron_cost_goods_receipt_lines: [],
    vyron_three_way_matches: [],
    vyron_documents: [
      { id: "doc-a", tenant_id: CO_A, status: "reviewed", supplier_name: "QA Supplier", invoice_number: "INV-A", total: 1000, purchase_order_id: null },
    ],
    vyron_document_line_items: [],
    vyron_cost_stores: [
      { id: "store-a", company_id: CO_A, store_name: "Store A", status: "Active" },
      { id: "store-b", company_id: CO_B, store_name: "Store B", status: "Active" },
    ],
    vyron_cost_store_orders: [
      storeOrder("so-a1", CO_A, "SO-A1", "Submitted"),
      storeOrder("so-a2", CO_A, "SO-A2", "Submitted"),
      storeOrder("so-a3", CO_A, "SO-A3", "Submitted"),
      storeOrder("so-b1", CO_B, "SO-B1", "Submitted"),
    ],
    vyron_cost_store_order_lines: [],
    vyron_cost_store_order_events: [],
    vyron_store_order_approval_rules: [],
    vyron_cost_procurement_requisitions: [],
    vyron_cost_procurement_requisition_lines: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function resetDb() {
  db = createFakeSupabase(seed(), { honourOrder: true });
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const rows = (table) => db.tables[table] || [];
const row = (table, id) => rows(table).find((r) => r.id === id) || {};
const audits = (entityId) => rows("vyron_procurement_audit_log").filter((a) => a.entity_id === entityId);
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const poItemRoute = await importFromRoot("src/app/api/purchase-orders/[id]/route.ts");
const poEngineRoute = await importFromRoot("src/app/api/purchase-orders/engine/route.ts");
const storeStatusRoute = await importFromRoot("src/app/api/store-orders/[id]/status/route.ts");
const storeWorkflowRoute = await importFromRoot("src/app/api/store-orders/[id]/workflow/route.ts");
const linkPoRoute = await importFromRoot("src/app/api/documents/[id]/link-po/route.ts");
const adminUsersRoute = await importFromRoot("src/app/api/workspace/admin/users/route.ts");

async function login(userId) {
  const user = USERS.find((u) => u.id === userId);
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: user.email, password: user.password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

async function call(jar, handler, url, { method = "POST", id, body } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = await quietly(() => (id === undefined ? handler(request) : handler(request, { params: Promise.resolve({ id }) })));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
const patchPo = (jar, id, body) => call(jar, poItemRoute.PATCH, `/api/purchase-orders/${id}`, { method: "PATCH", id, body });
const engineStatus = (jar, body) => call(jar, poEngineRoute.POST, "/api/purchase-orders/engine", { body });
const storeStatus = (jar, id, body) => call(jar, storeStatusRoute.PATCH, `/api/store-orders/${id}/status`, { method: "PATCH", id, body });
const storeWorkflow = (jar, id, body) => call(jar, storeWorkflowRoute.PATCH, `/api/store-orders/${id}/workflow`, { method: "PATCH", id, body });
const linkPo = (jar, docId, body) => call(jar, linkPoRoute.POST, `/api/documents/${docId}/link-po`, { id: docId, body });
const listMembers = (jar) => call(jar, adminUsersRoute.GET, "/api/workspace/admin/users", { method: "GET" });
const denied = (r) => r.status === 401 || r.status === 403;

resetDb();
const jar = {};
for (const [userId, , , , status] of MEMBERS) if (status === "Active") jar[userId] = await login(userId);
check("every active synthetic member signs in through the real login route", Object.values(jar).every((j) => Boolean(j.vyron_workspace_user_session)));

section("1. Purchase order approval records the signed-in approver");
{
  resetDb();
  const r = await patchPo(jar[U_OWNER], "po-a1", { status: "Approved", approvedBy: SPOOF, actor: SPOOF, approvalNotes: "Within budget" });
  check("owner approves → 200", r.status === 200 && r.json?.purchaseOrder?.status === "Approved", JSON.stringify(r.json).slice(0, 300));
  check("approved_by is the verified member, not the browser's approvedBy", row("vyron_cost_purchase_orders", "po-a1").approved_by === "Synthetic Owner", String(row("vyron_cost_purchase_orders", "po-a1").approved_by));
  const a = audits("po-a1").find((x) => x.event_type === "PO Approved") || {};
  check("the 'PO Approved' audit actor is the verified member", a.actor === "Synthetic Owner", String(a.actor));
  check("no record anywhere carries the spoofed name", !JSON.stringify(rows("vyron_procurement_audit_log")).includes(SPOOF) && !JSON.stringify(rows("vyron_cost_purchase_orders")).includes(SPOOF));

  const sup = await patchPo(jar[U_SUP], "po-a2", { status: "Rejected", rejectReason: "Wrong supplier", actor: SPOOF });
  check("SUPERVISOR rejects with a reason → 200", sup.status === 200 && row("vyron_cost_purchase_orders", "po-a2").status === "Rejected");
  const rej = audits("po-a2").find((x) => x.event_type === "PO Rejected") || {};
  check("the rejection audit names the supervisor, not the spoofed actor", rej.actor === "Synthetic Supervisor", String(rej.actor));

  const cancel = await patchPo(jar[U_OWNER], "po-a3", { status: "Cancelled", actor: SPOOF });
  check("owner cancels an approved PO → audited as the owner", cancel.status === 200 && (audits("po-a3").find((x) => x.event_type === "PO Cancelled") || {}).actor === "Synthetic Owner");
}

section("2. Purchase order approval: who is refused");
{
  resetDb();
  const clerk = await patchPo(jar[U_CLERK], "po-a1", { status: "Approved", approvedBy: "Synthetic Owner" });
  check("PROCUREMENT (edit, no approve) naming the owner as approver → 403", clerk.status === 403 && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted");
  const anon = await patchPo({}, "po-a1", { status: "Approved", approvedBy: "Synthetic Owner" });
  check("no session → 401/403, unchanged", denied(anon) && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted");
  const cross = await patchPo(jar[U_B_OWNER], "po-a1", { status: "Approved", companyId: CO_A });
  check("tenant B's OWNER approving tenant A's PO → refused, unchanged", cross.json?.ok !== true && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted", `${cross.status} ${JSON.stringify(cross.json)}`);
  const crossOwn = await patchPo(jar[U_B_OWNER], "po-a1", { status: "Approved" });
  check("…and through its own company context it cannot find tenant A's PO", crossOwn.json?.ok !== true && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted");
  check("no audit row was written by any refused caller", rows("vyron_procurement_audit_log").length === 0);
}

section("3. PO engine status route: approval statuses need approval permission, and are audited");
{
  resetDb();
  const clerk = await engineStatus(jar[U_CLERK], { id: "po-a1", status: "Approved" });
  check("PROCUREMENT setting Approved through the engine route → 403 (was allowed)", clerk.status === 403 && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted");
  const clerkSent = await engineStatus(jar[U_CLERK], { id: "po-a1", status: "Sent" });
  check("PROCUREMENT marking Sent → 403, as on the main PO route", clerkSent.status === 403);
  const owner = await engineStatus(jar[U_OWNER], { id: "po-a3", status: "Sent", actor: SPOOF });
  check("owner marks an approved PO Sent → 200", owner.status === 200 && row("vyron_cost_purchase_orders", "po-a3").status === "Sent", JSON.stringify(owner.json).slice(0, 200));
  const a = audits("po-a3").find((x) => x.event_type === "PO Status Changed") || {};
  check("the status change is now audited, as the verified member", a.actor === "Synthetic Owner" && /Sent/.test(a.detail || ""), JSON.stringify(a));
  const cross = await engineStatus(jar[U_B_OWNER], { id: "po-a1", status: "Approved" });
  check("tenant B's OWNER cannot change tenant A's PO (404, unchanged)", cross.status === 404 && row("vyron_cost_purchase_orders", "po-a1").status === "Submitted", `${cross.status}`);
}

section("4. Store order approval records the signed-in approver");
{
  resetDb();
  const r = await storeStatus(jar[U_OWNER], "so-a1", { status: "Approved", approvedBy: SPOOF });
  check("owner approves via status → 200", r.status === 200 && row("vyron_cost_store_orders", "so-a1").status === "Approved", JSON.stringify(r.json).slice(0, 300));
  check("approved_by is the verified member", row("vyron_cost_store_orders", "so-a1").approved_by === "Synthetic Owner", String(row("vyron_cost_store_orders", "so-a1").approved_by));

  const wf = await storeWorkflow(jar[U_SUP], "so-a2", { action: "approve", actor: SPOOF, note: "OK" });
  check("SUPERVISOR approves via workflow → 200", wf.status === 200 && row("vyron_cost_store_orders", "so-a2").status === "Approved", JSON.stringify(wf.json).slice(0, 300));
  check("workflow approved_by and event actor are the verified member", row("vyron_cost_store_orders", "so-a2").approved_by === "Synthetic Supervisor" && rows("vyron_cost_store_order_events").some((e) => e.store_order_id === "so-a2" && e.actor === "Synthetic Supervisor"));

  const rej = await storeWorkflow(jar[U_OWNER], "so-a3", { action: "reject", actor: SPOOF, note: "Duplicate order" });
  const ev = rows("vyron_cost_store_order_events").find((e) => e.store_order_id === "so-a3") || {};
  check("owner rejects → Cancelled, event actor is the owner, reason kept", rej.status === 200 && row("vyron_cost_store_orders", "so-a3").status === "Cancelled" && ev.actor === "Synthetic Owner" && row("vyron_cost_store_orders", "so-a3").rejection_reason === "Duplicate order");
  check("no store order record carries the spoofed name", !JSON.stringify(rows("vyron_cost_store_orders")).includes(SPOOF) && !JSON.stringify(rows("vyron_cost_store_order_events")).includes(SPOOF));
}

section("5. Store order approval: who is refused");
{
  resetDb();
  const clerk = await storeStatus(jar[U_CLERK], "so-a1", { status: "Approved", approvedBy: "Synthetic Owner" });
  check("PROCUREMENT (no store_orders.approve) → 403", clerk.status === 403 && row("vyron_cost_store_orders", "so-a1").status === "Submitted");
  const sales = await storeWorkflow(jar[U_SALES], "so-a1", { action: "approve", actor: "Synthetic Owner" });
  check("SALES (edit, no approve) approving via workflow → 403", sales.status === 403 && row("vyron_cost_store_orders", "so-a1").status === "Submitted");
  const anon = await storeWorkflow({}, "so-a1", { action: "approve" });
  check("no session → 401/403", denied(anon) && row("vyron_cost_store_orders", "so-a1").status === "Submitted");
  const cross = await storeStatus(jar[U_B_OWNER], "so-a1", { status: "Approved" });
  check("tenant B's OWNER approving tenant A's store order → refused, unchanged", cross.json?.ok !== true && row("vyron_cost_store_orders", "so-a1").status === "Submitted", `${cross.status} ${JSON.stringify(cross.json)}`);
  check("no store order event written by any refused caller", rows("vyron_cost_store_order_events").length === 0);
}

section("6. Linking an invoice to a purchase order stays inside the company");
{
  resetDb();
  const cross = await linkPo(jar[U_OWNER], "doc-a", { purchaseOrderId: "po-b1", actor: SPOOF });
  check("tenant A's invoice → tenant B's PO is refused", cross.json?.ok !== true, JSON.stringify(cross.json));
  check("…tenant B's PO number and total are not returned", !JSON.stringify(cross.json || {}).includes("PO-B1") && !JSON.stringify(cross.json || {}).includes("5000"));
  check("…and nothing was written into either company", row("vyron_documents", "doc-a").purchase_order_id == null && rows("vyron_procurement_audit_log").length === 0 && rows("vyron_three_way_matches").length === 0);
  const own = await linkPo(jar[U_OWNER], "doc-a", { purchaseOrderId: "po-a1", actor: SPOOF });
  check("linking to the company's own PO still works", own.status === 200 && row("vyron_documents", "doc-a").purchase_order_id === "po-a1", JSON.stringify(own.json).slice(0, 200));
  const a = rows("vyron_procurement_audit_log").find((x) => x.event_type === "Invoice Linked") || {};
  check("the link is audited as the verified member", a.actor === "Synthetic Owner" && a.company_id === CO_A, JSON.stringify(a));
  const anon = await linkPo({}, "doc-a", { purchaseOrderId: "po-a2" });
  check("no session → 401/403", denied(anon));
}

section("7. System → Settings → Users shows the real workspace members");
{
  resetDb();
  let target = null;
  try {
    const usersPage = await importFromRoot("src/app/users/page.tsx");
    usersPage.default();
  } catch (error) {
    target = String(error?.digest || error?.message || "");
  }
  check("/users redirects to User Setup (/admin/users)", /\/admin\/users/.test(target || ""), String(target));

  const a = await listMembers(jar[U_OWNER]);
  const names = (r) => (r.json?.members || []).map((m) => `${m.firstName} ${m.surname}`).sort();
  check("owner of tenant A sees tenant A's five members (legacy registry is empty)", a.status === 200 && names(a).length === 5, JSON.stringify(names(a)));
  check("…roles come from the memberships", (a.json?.members || []).find((m) => m.userId === U_CLERK)?.role === "PROCUREMENT" && (a.json?.members || []).find((m) => m.userId === U_OWNER)?.role === "OWNER");
  check("…a disabled membership is shown as Disabled, not active", (a.json?.members || []).find((m) => m.userId === U_DISABLED)?.status === "Disabled");
  check("…active user count excludes the disabled member (4)", a.json?.activeUsers === 4, String(a.json?.activeUsers));
  check("…and no tenant B member appears", !names(a).some((n) => n.startsWith("Tenant B")));
  const b = await listMembers(jar[U_B_OWNER]);
  check("owner of tenant B sees only tenant B's member", b.status === 200 && names(b).length === 1 && names(b)[0] === "Tenant B Owner", JSON.stringify(names(b)));
  const sup = await listMembers(jar[U_SUP]);
  check("SUPERVISOR (admin.users by role) sees tenant A's members", sup.status === 200 && names(sup).length === 5);
  const clerk = await listMembers(jar[U_CLERK]);
  check("PROCUREMENT (no admin.users) → 403", clerk.status === 403, String(clerk.status));
  const anon = await listMembers({});
  check("no session → 401/403", denied(anon), String(anon.status));
  const empty = await listMembers(jar[U_EMPTY_OWNER]);
  check("a workspace with one member lists exactly that member", empty.status === 200 && names(empty).join() === "Empty Owner", JSON.stringify(names(empty)));
  check("no duplicate user records were created to fill the page", rows("vyron_cost_users").length === 0);
}

section("8. No purchasing or ordering route takes its actor from the request");
{
  // Routes whose actor used to come from the body. Each now derives it from the session.
  const ROUTES = [
    "purchase-orders/route.ts", "purchase-orders/[id]/route.ts", "purchase-orders/[id]/archive/route.ts",
    "purchase-orders/[id]/receive/route.ts", "purchase-orders/engine/route.ts", "goods-receipts/route.ts",
    "goods-receipts/[id]/route.ts", "procurement-requisitions/route.ts", "inventory/alerts/create-po/route.ts",
    "store-orders/[id]/status/route.ts", "store-orders/[id]/workflow/route.ts", "store-production-runs/route.ts",
    "store-production-runs/[id]/route.ts", "documents/[id]/link-po/route.ts",
  ];
  const IDENTITY_FROM_BODY = /body\??\.(actor|approvedBy|approved_by|created_by|createdBy|completed_by|rolledBackBy)\b|body\.received_by\s*\|\||actor:\s*"user"/;
  const offenders = ROUTES.filter((r) => IDENTITY_FROM_BODY.test(readFileSync(path.join(ROOT, "src/app/api", r), "utf8")));
  check("none of the 14 routes records a browser-supplied identity", offenders.length === 0, offenders.join(", "));
  const withSession = ROUTES.filter((r) => /memberDisplayName\(supabase, session\)/.test(readFileSync(path.join(ROOT, "src/app/api", r), "utf8")));
  check("each of them names the verified member (memberDisplayName)", withSession.length === ROUTES.length, ROUTES.filter((r) => !withSession.includes(r)).join(", "));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
