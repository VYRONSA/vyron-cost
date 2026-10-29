#!/usr/bin/env node
/**
 * VOLORA — approvals, cost-recovery and procurement-recommendation writes go
 * through the server and record the signed-in member.
 *
 * DEFECTS THIS LOCKS DOWN (2026-10-29)
 * ------------------------------------
 * Three screens wrote straight to the database from the browser with the public
 * key, choosing the name recorded:
 *   1. Approval Centre: any vyron_cost_approvals row by id, any company,
 *      approved_by "Current User".
 *   2. Recovery Status: tracking and evidence for any opportunity key; the
 *      audit trail read "Finance Manager", evidence the typed owner's name.
 *   3. Procurement recommendation detail: tracking and evidence, bypassing the
 *      hardened tracking route; "Procurement Manager" / the typed owner's name.
 * Now each is a server route with a permission, the member's own company, and
 * the member as actor. Business fields (owner name and e-mail, notes, evidence
 * text) are kept exactly as entered.
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data.
 *
 *   npm run test:browser-identity-writes
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
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10), U_BUYER = uuid("a", 11), U_SUP = uuid("a", 12), U_VIEW = uuid("a", 13), U_SUP_OFF = uuid("a", 14);
const U_B_OWNER = uuid("b", 10);
const AP_A1 = uuid("c", 1), AP_A2 = uuid("c", 2), AP_A3 = uuid("c", 3), AP_DONE = uuid("c", 4), AP_B = uuid("c", 5);
const SPOOF = "Someone Else (spoofed)";

const MEMBERS = [
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", {}, "Synthetic", "Owner"],
  [U_BUYER, "buyer@qa-a.test", WS_A, "PROCUREMENT", {}, "Synthetic", "Buyer"],
  [U_SUP, "sup@qa-a.test", WS_A, "SUPERVISOR", {}, "Synthetic", "Supervisor"],
  [U_VIEW, "view@qa-a.test", WS_A, "VIEW_ONLY", {}, "Synthetic", "Viewer"],
  [U_SUP_OFF, "sup-off@qa-a.test", WS_A, "SUPERVISOR", { "approvals.decide": false, "recovery.manage": false }, "Restricted", "Supervisor"],
  [U_B_OWNER, "owner@qa-b.test", WS_B, "OWNER", {}, "Tenant B", "Owner"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));

const approval = (id, company, status = "Pending") => ({
  id, company_id: company, approval_type: "GP Override", entity_type: "Product", entity_id: "p1", title: `Reprice ${id.slice(-2)}`,
  detail: "GP below target", risk_level: "High", current_value: 10, proposed_value: 12, financial_impact: 500, status,
  requested_by: "VYRON COST", approved_by: status === "Pending" ? null : "Earlier Approver", decision_note: null,
  created_at: "2026-10-20T08:00:00Z", decided_at: status === "Pending" ? null : "2026-10-21T08:00:00Z",
});

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Full", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Full", status: "Setup" },
    ],
    vyron_workspace_memberships: MEMBERS.map(([userId, , ws, role, permissions], i) => ({ id: `m${i}`, workspace_id: ws, user_id: userId, role, status: "Active", permissions })),
    vyron_user_profiles: MEMBERS.map(([id, email, , , , first_name, surname]) => ({ id, email, first_name, surname })),
    vyron_cost_approvals: [approval(AP_A1, CO_A), approval(AP_A2, CO_A), approval(AP_A3, CO_A), approval(AP_DONE, CO_A, "Approved"), approval(AP_B, CO_B)],
    vyron_recovery_calculations: [
      { id: "rc-a", tenant_id: CO_A, opportunity_key: "rec-a", potential_recovery: 1200 },
      { id: "rc-b", tenant_id: CO_B, opportunity_key: "rec-b", potential_recovery: 900 },
    ],
    vyron_recovery_tracking: [],
    vyron_recovery_audit_trail: [],
    vyron_recovery_evidence: [],
    vyron_procurement_recommendations: [
      { id: "pr-a", tenant_id: CO_A, recommendation_key: "proc-a", potential_benefit_annual: 5000 },
      { id: "pr-b", tenant_id: CO_B, recommendation_key: "proc-b", potential_benefit_annual: 3000 },
    ],
    vyron_procurement_recommendation_tracking: [],
    vyron_procurement_recommendation_audit: [],
    vyron_procurement_recommendation_evidence: [],
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
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};
const noSpoof = (...tables) => !tables.some((t) => JSON.stringify(rows(t)).includes(SPOOF));

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
const decisionRoute = await importFromRoot("src/app/api/approvals/[id]/decision/route.ts");
const recTracking = await importFromRoot("src/app/api/recovery/[key]/tracking/route.ts");
const recEvidence = await importFromRoot("src/app/api/recovery/[key]/evidence/route.ts");
const procTracking = await importFromRoot("src/app/api/procurement/recommendations/[key]/tracking/route.ts");
const procEvidence = await importFromRoot("src/app/api/procurement/recommendations/[key]/evidence/route.ts");

async function login(userId) {
  const user = USERS.find((u) => u.id === userId);
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: user.email, password: user.password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, url, param, method, body) {
  setCookieJar(jar);
  const request = new NextRequest(new URL(url, "http://qa.local"), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const res = await quietly(() => handler(request, { params: Promise.resolve(param) }));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
const decide = (jar, id, body) => call(jar, decisionRoute.POST, `/api/approvals/${id}/decision`, { id }, "POST", body);
const recTrack = (jar, key, body) => call(jar, recTracking.PATCH, `/api/recovery/${key}/tracking`, { key }, "PATCH", body);
const recEvid = (jar, key, body) => call(jar, recEvidence.POST, `/api/recovery/${key}/evidence`, { key }, "POST", body);
const procTrack = (jar, key, body) => call(jar, procTracking.PATCH, `/api/procurement/recommendations/${key}/tracking`, { key }, "PATCH", body);
const procEvid = (jar, key, body) => call(jar, procEvidence.POST, `/api/procurement/recommendations/${key}/evidence`, { key }, "POST", body);
const denied = (r) => r.status === 401 || r.status === 403;

resetDb();
const jar = {};
for (const [userId] of MEMBERS) jar[userId] = await login(userId);
check("every synthetic member signs in through the real login route", Object.values(jar).every((j) => Boolean(j.vyron_workspace_user_session)));

section("1. Approval Centre decisions are made on the server, as the member");
{
  resetDb();
  const r = await decide(jar[U_OWNER], AP_A1, { status: "Approved", approved_by: SPOOF, approvedBy: SPOOF, note: "Within margin policy" });
  check("owner approves a pending approval → 200", r.status === 200 && row("vyron_cost_approvals", AP_A1).status === "Approved", `${r.status} ${JSON.stringify(r.json)}`);
  check("approved_by is the signed-in member, not 'Current User' or the body", row("vyron_cost_approvals", AP_A1).approved_by === "Synthetic Owner", String(row("vyron_cost_approvals", AP_A1).approved_by));
  check("the decision note and time are recorded", row("vyron_cost_approvals", AP_A1).decision_note === "Within margin policy" && Boolean(row("vyron_cost_approvals", AP_A1).decided_at));
  const sup = await decide(jar[U_SUP], AP_A2, { status: "Rejected" });
  check("SUPERVISOR rejects by role default → 200, recorded as the supervisor", sup.status === 200 && row("vyron_cost_approvals", AP_A2).approved_by === "Synthetic Supervisor");
  const again = await decide(jar[U_OWNER], AP_DONE, { status: "Rejected" });
  check("an already-decided approval is not overwritten (404)", again.status === 404 && row("vyron_cost_approvals", AP_DONE).approved_by === "Earlier Approver" && row("vyron_cost_approvals", AP_DONE).status === "Approved");
  const buyer = await decide(jar[U_BUYER], AP_A3, { status: "Approved" });
  check("PROCUREMENT (no approvals.decide) → 403", buyer.status === 403 && row("vyron_cost_approvals", AP_A3).status === "Pending");
  const off = await decide(jar[U_SUP_OFF], AP_A3, { status: "Approved" });
  check("a SUPERVISOR with approvals.decide switched off → 403", off.status === 403);
  const anon = await decide({}, AP_A3, { status: "Approved" });
  check("signed out → 401/403", denied(anon) && row("vyron_cost_approvals", AP_A3).status === "Pending");
  const cross = await decide(jar[U_B_OWNER], AP_A3, { status: "Approved" });
  check("tenant B's owner cannot decide tenant A's approval (404)", cross.status === 404 && row("vyron_cost_approvals", AP_A3).status === "Pending");
  const bad = await decide(jar[U_OWNER], AP_A3, { status: "Deleted" });
  check("a status other than Approved / Rejected → 400", bad.status === 400 && row("vyron_cost_approvals", AP_A3).status === "Pending");
  const demo = await decide(jar[U_OWNER], "hfp-approval-1", { status: "Approved" });
  check("a non-database (demo) id → 404, nothing written", demo.status === 404);
  check("no approval carries a spoofed name or 'Current User'", noSpoof("vyron_cost_approvals") && !JSON.stringify(rows("vyron_cost_approvals")).includes("Current User"));
}

section("2. Cost-recovery tracking and evidence");
{
  resetDb();
  const r = await recTrack(jar[U_OWNER], "rec-a", { status: "Under Review", ownerName: "Assigned Buyer", ownerEmail: "assigned@qa-a.test", notes: "Credit note requested", actualRecovery: 300, changedBy: SPOOF, changed_by: SPOOF });
  check("owner updates tracking → 200", r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  const t = rows("vyron_recovery_tracking")[0] || {};
  check("business fields are kept exactly: owner name / e-mail, notes, amount", t.owner_name === "Assigned Buyer" && t.owner_email === "assigned@qa-a.test" && t.notes === "Credit note requested" && Number(t.actual_recovery) === 300 && t.tenant_id === CO_A);
  const audit = rows("vyron_recovery_audit_trail");
  check("every audit row names the signed-in member, not 'Finance Manager'", audit.length >= 2 && audit.every((a) => a.changed_by === "Synthetic Owner" && a.tenant_id === CO_A), JSON.stringify(audit.map((a) => a.changed_by)));

  const e = await recEvid(jar[U_SUP], "rec-a", { evidenceType: "Notes", title: "Supplier call", content: "  Rep agreed to credit R300 on next invoice.  ", documentUrl: "https://example.test/credit.pdf", createdBy: SPOOF });
  const ev = rows("vyron_recovery_evidence")[0] || {};
  check("SUPERVISOR adds evidence → 200", e.status === 200, `${e.status} ${JSON.stringify(e.json)}`);
  check("evidence created_by is the member, not the typed owner name", ev.created_by === "Synthetic Supervisor", String(ev.created_by));
  check("evidence content is preserved (trimmed only), with type, title and link", ev.content === "Rep agreed to credit R300 on next invoice." && ev.title === "Supplier call" && ev.evidence_type === "Notes" && ev.document_url === "https://example.test/credit.pdf");
  const noTitle = await recEvid(jar[U_OWNER], "rec-a", { evidenceType: "Notes", title: "  " });
  check("evidence without a title → 400", noTitle.status === 400 && rows("vyron_recovery_evidence").length === 1);
  const badStatus = await recTrack(jar[U_OWNER], "rec-a", { status: "Paid" });
  check("an unknown tracking status → 400", badStatus.status === 400);

  const buyer = await recTrack(jar[U_BUYER], "rec-a", { status: "Accepted" });
  const buyerEv = await recEvid(jar[U_BUYER], "rec-a", { evidenceType: "Notes", title: "x" });
  check("PROCUREMENT (no recovery.manage) → 403 on tracking and evidence", buyer.status === 403 && buyerEv.status === 403);
  const off = await recTrack(jar[U_SUP_OFF], "rec-a", { status: "Accepted" });
  check("a SUPERVISOR with recovery.manage switched off → 403", off.status === 403);
  const anon = await recEvid({}, "rec-a", { evidenceType: "Notes", title: "x" });
  check("signed out → 401/403", denied(anon));
  const crossT = await recTrack(jar[U_OWNER], "rec-b", { status: "Recovered", actualRecovery: 900 });
  const crossE = await recEvid(jar[U_OWNER], "rec-b", { evidenceType: "Notes", title: "x" });
  check("tenant A's owner on tenant B's opportunity → 404 for tracking and evidence", crossT.status === 404 && crossE.status === 404);
  check("…and nothing was written for tenant B", !rows("vyron_recovery_tracking").some((x) => x.tenant_id === CO_B) && !rows("vyron_recovery_evidence").some((x) => x.tenant_id === CO_B) && !rows("vyron_recovery_audit_trail").some((x) => x.tenant_id === CO_B));
  check("no recovery record carries the spoofed name", noSpoof("vyron_recovery_tracking", "vyron_recovery_audit_trail", "vyron_recovery_evidence"));
}

section("3. Procurement recommendation tracking and evidence");
{
  resetDb();
  const t = await procTrack(jar[U_BUYER], "proc-a", { status: "Accepted", ownerName: "Assigned Buyer", notes: "Switch to 25kg packs", actualBenefit: 1200, changedBy: SPOOF });
  check("PROCUREMENT (purchase_orders.edit) updates tracking → 200", t.status === 200, `${t.status} ${JSON.stringify(t.json)}`);
  const tr = rows("vyron_procurement_recommendation_tracking")[0] || {};
  check("business fields kept: owner name, notes, benefit; tenant is A", tr.owner_name === "Assigned Buyer" && tr.notes === "Switch to 25kg packs" && Number(tr.actual_benefit) === 1200 && tr.tenant_id === CO_A);
  const audit = rows("vyron_procurement_recommendation_audit");
  check("audit rows name the member, not 'Procurement Manager' or a user id", audit.length >= 1 && audit.every((a) => a.changed_by === "Synthetic Buyer"), JSON.stringify(audit.map((a) => a.changed_by)));
  const e = await procEvid(jar[U_BUYER], "proc-a", { evidenceType: "Quote", title: "Supplier quote", content: "R18.40/kg at 25kg", createdBy: SPOOF });
  const ev = rows("vyron_procurement_recommendation_evidence")[0] || {};
  check("PROCUREMENT adds evidence → 200, created_by is the member, content kept", e.status === 200 && ev.created_by === "Synthetic Buyer" && ev.content === "R18.40/kg at 25kg" && ev.title === "Supplier quote", `${e.status} ${JSON.stringify(ev)}`);
  const view = await procEvid(jar[U_VIEW], "proc-a", { evidenceType: "Quote", title: "x" });
  check("VIEW_ONLY → 403", view.status === 403);
  const anon = await procEvid({}, "proc-a", { evidenceType: "Quote", title: "x" });
  check("signed out → 401/403", denied(anon));
  const crossE = await procEvid(jar[U_BUYER], "proc-b", { evidenceType: "Quote", title: "x" });
  const crossT = await procTrack(jar[U_BUYER], "proc-b", { status: "Closed" });
  check("tenant A on tenant B's recommendation → 404 for evidence and tracking", crossE.status === 404 && crossT.status === 404);
  check("…nothing written for tenant B, no spoofed name anywhere", !JSON.stringify(rows("vyron_procurement_recommendation_evidence").concat(rows("vyron_procurement_recommendation_tracking"))).includes(CO_B) && noSpoof("vyron_procurement_recommendation_tracking", "vyron_procurement_recommendation_audit", "vyron_procurement_recommendation_evidence"));
}

section("4. The three screens no longer write to the database themselves");
{
  const SCREENS = ["src/components/ApprovalCentreClient.tsx", "src/components/RecoveryStatusClient.tsx", "src/components/ProcurementRecommendationDetailClient.tsx"];
  const src = (f) => readFileSync(path.join(ROOT, f), "utf8");
  const direct = SCREENS.filter((f) => /from "@\/lib\/supabase"|\.(insert|update|upsert)\(/.test(src(f)));
  check("no direct database writes or public-key client import", direct.length === 0, direct.join(", "));
  const labels = SCREENS.filter((f) => /"Current User"|"Finance Manager"|"Procurement Manager"|createdBy:/.test(src(f)));
  check("no hard-coded or browser-chosen actor names", labels.length === 0, labels.join(", "));
  const callsWriters = SCREENS.filter((f) => /\b(saveRecoveryTracking|addRecoveryEvidence|saveProcurementTracking|addProcurementEvidence)\b/.test(src(f)));
  check("they call the server routes, not the writer functions", callsWriters.length === 0, callsWriters.join(", "));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
