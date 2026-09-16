#!/usr/bin/env node
/**
 * VYRON — owner user-registry provisioning: PostgreSQL + PostgREST integration
 * tests (Phase 39). NEVER production.
 *
 * Runs the real src/lib/vyron-saas-workspace.ts against an ISOLATED, disposable
 * Supabase Postgres loaded with a schema-only dump of production (no rows) and a
 * real PostgREST. The Supabase Auth admin API is an in-memory stand-in served by
 * this script. Proves: the old ON CONFLICT (email) upsert is rejected by
 * PostgREST (the root cause), migration 20260916120000 (guards, idempotence),
 * exactly one registry row per (company, email), idempotent re-provisioning,
 * duplicate rejection, tenant isolation, and that registry failures are thrown
 * and roll back the new company.
 *
 * Setup (Docker; the schema dump contains structure only):
 *   npx supabase db dump --linked --schema public -f <tmp>/schema.sql
 *   docker network create vyron-owner-registry
 *   docker run -d --rm --name vyron-owner-registry-db --network vyron-owner-registry  *     -e POSTGRES_PASSWORD=test -p 127.0.0.1:55439:5432 public.ecr.aws/supabase/postgres:17.6.1.143
 *   docker cp <tmp>/schema.sql vyron-owner-registry-db:/tmp/schema.sql
 *   docker exec vyron-owner-registry-db psql -U supabase_admin -h 127.0.0.1 -d postgres -q -f /tmp/schema.sql
 *   docker exec vyron-owner-registry-db psql -U supabase_admin -h 127.0.0.1 -d postgres  *     -c "alter role authenticator with login password 'test'"
 *   docker run -d --rm --name vyron-owner-registry-rest --network vyron-owner-registry  *     -e PGRST_DB_URI=postgres://authenticator:test@vyron-owner-registry-db:5432/postgres  *     -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon  *     -e PGRST_JWT_SECRET=vyron-owner-registry-isolated-jwt-secret-0123  *     -p 127.0.0.1:55440:3000 public.ecr.aws/supabase/postgrest:v14.15
 *   node scripts/test-owner-registry-provisioning-pg.mjs
 * Needs `openssl` on PATH (a throwaway self-signed certificate for the local gateway).
 */
import https from "node:https";
import http from "node:http";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DB_CONTAINER = process.env.OWNER_REGISTRY_DB_CONTAINER || "vyron-owner-registry-db";
const MIGRATION = path.join(ROOT, "src/supabase/migrations/20260916120000_vyron_cost_users_company_email_unique.sql");
const SECRET = process.env.OWNER_REGISTRY_JWT_SECRET || "vyron-owner-registry-isolated-jwt-secret-0123";
const REST = process.env.OWNER_REGISTRY_REST_URL || "http://127.0.0.1:55440";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(REST)) { console.error("REFUSING: PostgREST must be a local isolated instance:", REST); process.exit(2); }
const PORT = 55441;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); } };
const expectThrow = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

// ---------------------------------------------------------------- database access (container psql only)
const psql = (sql) => execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "supabase_admin", "-h", "127.0.0.1", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-q"], { input: sql, encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).trim();
const psqlTry = (sql) => { try { return { out: psql(sql) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const applyMigration = () => psqlTry(readFileSync(MIGRATION, "utf8"));
const reloadSchema = async () => { psql("notify pgrst, 'reload schema';"); await new Promise((r) => setTimeout(r, 1500)); };
const registry = () => JSON.parse(psql("select coalesce(json_agg(r order by created_at, email), '[]') from (select id, company_id, full_name, email, role, status, created_at from public.vyron_cost_users) r;"));
const n = (sql) => Number(psql(sql));

// ---------------------------------------------------------------- gateway
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ role: "service_role", iss: "vyron-owner-registry-test", iat: 1700000000, exp: 2000000000 });
const JWT = `${head}.${body}.${crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;

const authUsers = new Map();
const authLog = [];
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmed ? "2026-09-16T00:00:00Z" : null, banned_until: u.banned ? "2126-01-01T00:00:00Z" : null, user_metadata: u.meta, app_metadata: {}, created_at: "2026-09-16T00:00:00Z" });
function authHandler(req, res, raw) {
  const url = new URL(req.url, "https://x");
  const send = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
  const input = raw ? JSON.parse(raw) : {};
  const idMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
  authLog.push(`${req.method} ${url.pathname}`);
  if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") {
    const all = [...authUsers.values()].map(userJson);
    return send(200, { users: all, aud: "authenticated" }, { "x-total-count": String(all.length) });
  }
  if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
    const email = String(input.email).toLowerCase();
    if ([...authUsers.values()].some((u) => u.email === email)) return send(422, { error_code: "email_exists", msg: "A user with this email address has already been registered" });
    const u = { id: crypto.randomUUID(), email, confirmed: Boolean(input.email_confirm), banned: false, meta: input.user_metadata || {}, passwordSet: Boolean(input.password) };
    authUsers.set(u.id, u);
    return send(200, userJson(u));
  }
  if (url.pathname === "/auth/v1/invite" && req.method === "POST") {
    const email = String(input.email).toLowerCase();
    if ([...authUsers.values()].some((u) => u.email === email)) return send(422, { error_code: "email_exists", msg: "A user with this email address has already been registered" });
    const u = { id: crypto.randomUUID(), email, confirmed: false, banned: false, meta: input.data || {} };
    authUsers.set(u.id, u);
    return send(200, userJson(u));
  }
  if (idMatch) {
    const u = authUsers.get(idMatch[1]);
    if (!u) return send(404, { error_code: "user_not_found", msg: "User not found" });
    if (req.method === "GET") return send(200, userJson(u));
    if (req.method === "PUT") {
      if (input.email) u.email = String(input.email).toLowerCase();
      if (input.email_confirm) u.confirmed = true;
      if (input.ban_duration) u.banned = input.ban_duration !== "none";
      if (input.password) u.passwordSet = true;
      if (input.user_metadata) u.meta = input.user_metadata;
      return send(200, userJson(u));
    }
    if (req.method === "DELETE") { authUsers.delete(u.id); return send(200, {}); }
  }
  return send(404, { msg: `stand-in does not implement ${req.method} ${url.pathname}` });
}
const certDir = mkdtempSync(path.join(os.tmpdir(), "vyron-owner-registry-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
const server = https.createServer({ key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) }, (req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c)).on("end", () => {
    const raw = Buffer.concat(chunks);
    if (req.url.startsWith("/auth/v1/")) return authHandler(req, res, raw.toString());
    if (!req.url.startsWith("/rest/v1/")) { res.writeHead(404); return res.end(); }
    const headers = { ...req.headers, host: "127.0.0.1:55440" };
    const up = http.request(`${REST}${req.url.slice("/rest/v1".length)}`, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    up.end(raw);
  });
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// ---------------------------------------------------------------- application under test
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://127.0.0.1:${PORT}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = JWT;
process.env.SUPABASE_SERVICE_ROLE_KEY = JWT;
process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3007";
register(pathToFileURL(path.join(ROOT, "scripts/support/migration-hook.mjs")).href, pathToFileURL(`${ROOT}/scripts/`).href);
const ws = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-saas-workspace.ts")).href);
const { createClient } = (await import("node:module")).createRequire(path.join(ROOT, "package.json"))("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, JWT, { auth: { persistSession: false } });

const admin = (email, first = "Olivia", surname = "Owner") => ({ firstName: first, surname, email, mobile: "0000000000" });
const client = (name, email, method = "password") => ({
  companyName: name, tradingName: "", contactEmail: "", phone: "", packageName: "Full", userLimit: 5,
  admin: admin(email), loginSetup: method === "password" ? { method, password: "Isolated-Test-Pass-1" } : { method },
});
const companiesNamed = (name) => n(`select count(*) from public.vyron_cost_companies where name = '${name}'`);
const workspacesNamed = (name) => n(`select count(*) from public.vyron_workspaces where company_name = '${name}'`);

console.log(`Isolated stack: ${process.env.NEXT_PUBLIC_SUPABASE_URL} → PostgREST ${REST} → ${DB_CONTAINER} (${n("select count(*) from information_schema.tables where table_schema='public'")} public tables, schema-only dump of production)`);

// ================================================================ 0. production-faithful schema, before the migration
console.log("\n0. Before the migration (schema exactly as production)");
check("vyron_cost_users has no unique constraint besides the primary key", psql("select string_agg(conname, ',' order by conname) from pg_constraint where conrelid='public.vyron_cost_users'::regclass") === "vyron_cost_users_company_id_fkey,vyron_cost_users_pkey");
psql("insert into public.vyron_cost_companies (id, name) values ('00000000-0000-4000-8000-00000000000a', 'Root Cause Co');");
const legacy = await sb.from("vyron_cost_users").upsert({ company_id: "00000000-0000-4000-8000-00000000000a", full_name: "X", email: "rc@example.test", role: "OWNER", status: "Active" }, { onConflict: "email" });
check("ROOT CAUSE: the old upsert (onConflict email) is rejected by PostgREST", Boolean(legacy.error), JSON.stringify(legacy.error));
check("ROOT CAUSE: supabase-js returns the error instead of throwing (so try/catch never saw it)", legacy.error?.code === "42P10", legacy.error?.code);
check("ROOT CAUSE: no row was written", registry().length === 0);
psql("delete from public.vyron_cost_companies where id = '00000000-0000-4000-8000-00000000000a';");

const beforeMsg = await expectThrow(() => ws.createClientWorkspace(client("Pre Migration Co", "pre@example.test")));
check("fixed code FAILS LOUDLY when the registry write fails (no constraint yet)", Boolean(beforeMsg && beforeMsg.startsWith("User registry save failed")), beforeMsg);
check("…and the half-created company is rolled back", companiesNamed("Pre Migration Co") === 0);
check("…and the half-created workspace is rolled back", workspacesNamed("Pre Migration Co") === 0);

// ================================================================ migration
console.log("\nMigration 20260916120000");
psql("insert into public.vyron_cost_companies (id, name) values ('00000000-0000-4000-8000-00000000000b', 'Guard Co');");
psql("insert into public.vyron_cost_users (company_id, full_name, email) values ('00000000-0000-4000-8000-00000000000b','A','dup@example.test'),('00000000-0000-4000-8000-00000000000b','B','dup@example.test');");
const dupRun = applyMigration();
check("refuses (and changes nothing) when duplicate (company, email) rows exist", Boolean(dupRun.err?.includes("duplicate (company_id, email)")) && n("select count(*) from pg_constraint where conrelid='public.vyron_cost_users'::regclass") === 2, dupRun.err);
psql("delete from public.vyron_cost_users; insert into public.vyron_cost_users (company_id, full_name, email) values ('00000000-0000-4000-8000-00000000000b','A',' Mixed@Example.test');");
const caseRun = applyMigration();
check("refuses when an email is not trimmed lower-case", Boolean(caseRun.err?.includes("not trimmed lower-case")), caseRun.err);
psql("delete from public.vyron_cost_users; delete from public.vyron_cost_companies where id = '00000000-0000-4000-8000-00000000000b';");
const first = applyMigration();
check("applies cleanly to the (empty) production-shaped table", !first.err, first.err);
const second = applyMigration();
check("re-applying is a no-op", !second.err, second.err);
check("constraints present exactly once", psql("select string_agg(conname || '=' || pg_get_constraintdef(oid), ' | ' order by conname) from pg_constraint where conrelid='public.vyron_cost_users'::regclass and conname like '%email%'") === "vyron_cost_users_company_email_key=UNIQUE (company_id, email) | vyron_cost_users_email_normalised=CHECK ((email = lower(btrim(email))))");
check("no column or row changed", psql("select count(*) || '/' || string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='vyron_cost_users'") === "7/id,company_id,full_name,email,role,status,created_at" && registry().length === 0);
await reloadSchema();

// ================================================================ 1. provisioning creates exactly one row
console.log("\n1. New tenant owner provisioning");
const a = await ws.createClientWorkspace(client("Alpha Foods (Pty) Ltd", "  Owner.Alpha@Example.test "));
let reg = registry();
check("createClientWorkspace succeeds", Boolean(a.workspace?.id && a.authProvisioned));
check("exactly one registry row", reg.length === 1, JSON.stringify(reg));
check("row belongs to the new company", reg[0]?.company_id === a.workspace.companyId);
check("email stored trimmed lower-case", reg[0]?.email === "owner.alpha@example.test");
check("role OWNER, status Active, full name", reg[0]?.role === "OWNER" && reg[0]?.status === "Active" && reg[0]?.full_name === "Olivia Owner");
check("profile, membership and workspace owner still provisioned as before", n(`select count(*) from public.vyron_workspace_memberships where workspace_id='${a.workspace.id}' and user_id='${a.workspace.ownerUserId}' and role='OWNER'`) === 1 && n(`select count(*) from public.vyron_user_profiles where id='${a.workspace.ownerUserId}'`) === 1);
const alphaRowId = reg[0].id;

// ================================================================ 2. re-running provisioning is idempotent
console.log("\n2. Re-running provisioning");
const ownerA = { firstName: "Olivia", surname: "Owner", email: "owner.alpha@example.test", mobile: "0000000000" };
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "enable", admin: ownerA });
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "enable", admin: ownerA });
reg = registry();
check("Enable Login twice: still one row, same id", reg.length === 1 && reg[0].id === alphaRowId);
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "enable", admin: { ...ownerA, surname: "Owner-Smith" } });
reg = registry();
check("a re-run updates the same row in place (name refreshed)", reg.length === 1 && reg[0].id === alphaRowId && reg[0].full_name === "Olivia Owner-Smith");
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "disable", admin: ownerA });
check("Disable Login: same row → Inactive", registry().length === 1 && registry()[0].status === "Inactive");
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "enable", admin: ownerA });
check("Enable Login: same row → Active", registry().length === 1 && registry()[0].status === "Active");
await ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "save", admin: ownerA });
check("Save owner details: registry untouched (unchanged behaviour)", registry().length === 1 && registry()[0].id === alphaRowId);

// ================================================================ 3. duplicate identity
console.log("\n3. Duplicate identity");
const dup = await sb.from("vyron_cost_users").insert({ company_id: a.workspace.companyId, full_name: "Dup", email: "owner.alpha@example.test" });
check("a second (company, email) row is rejected (23505)", dup.error?.code === "23505", JSON.stringify(dup.error));
const mixed = await sb.from("vyron_cost_users").insert({ company_id: a.workspace.companyId, full_name: "Dup", email: "OWNER.ALPHA@example.test" });
check("a case-variant of the same email is rejected (23514)", mixed.error?.code === "23514", JSON.stringify(mixed.error));
check("still one row", registry().length === 1);

// ================================================================ 4. tenant isolation
console.log("\n4. Tenant isolation");
const b = await ws.createClientWorkspace(client("Beta Meals (Pty) Ltd", "owner.alpha@example.test"));
reg = registry();
const alphaRow = reg.find((r) => r.id === alphaRowId);
const betaRow = reg.find((r) => r.company_id === b.workspace.companyId);
check("same person owning a second company: two rows, one per company", reg.length === 2 && Boolean(betaRow));
check("the first company's row was NOT moved or changed", alphaRow?.company_id === a.workspace.companyId && alphaRow?.full_name === "Olivia Owner" && alphaRow?.status === "Active");
await ws.updateWorkspaceOwnerLogin(b.workspace.id, { action: "disable", admin: ownerA });
reg = registry();
check("disabling in company B changes only B's row", reg.find((r) => r.id === alphaRowId)?.status === "Active" && reg.find((r) => r.company_id === b.workspace.companyId)?.status === "Inactive");
check("the workspace owner action cannot name a company: it writes only the workspace's own company", reg.every((r) => [a.workspace.companyId, b.workspace.companyId].includes(r.company_id)));
const c = await ws.createClientWorkspace(client("Gamma Kitchens", "owner.gamma@example.test", "invite"));
reg = registry();
check("invite provisioning: one row for Gamma, Active (unchanged status mapping)", reg.filter((r) => r.company_id === c.workspace.companyId).length === 1 && reg.find((r) => r.company_id === c.workspace.companyId)?.status === "Active");
check("other companies' rows untouched", reg.length === 3 && reg.find((r) => r.id === alphaRowId)?.full_name === "Olivia Owner");
check("a workspace always has a company (vyron_workspaces.company_id is NOT NULL), so the registry key always names one", psql("select is_nullable from information_schema.columns where table_schema='public' and table_name='vyron_workspaces' and column_name='company_id'") === "NO");

// ================================================================ 5. database failures surface
console.log("\n5. Database failures are surfaced");
psql("revoke insert, update on public.vyron_cost_users from service_role;");
const denied = await expectThrow(() => ws.createClientWorkspace(client("Delta Denied Co", "owner.delta@example.test")));
check("createClientWorkspace throws the registry error", Boolean(denied?.startsWith("User registry save failed:") && denied.includes("permission denied")), denied);
check("…and rolls back the company", companiesNamed("Delta Denied Co") === 0);
check("…and the workspace", workspacesNamed("Delta Denied Co") === 0);
const deniedEnable = await expectThrow(() => ws.updateWorkspaceOwnerLogin(a.workspace.id, { action: "enable", admin: ownerA }));
check("Enable Login throws the registry error instead of reporting success", Boolean(deniedEnable?.startsWith("User registry save failed:")), deniedEnable);
psql("grant insert, update on public.vyron_cost_users to service_role;");
check("registry unchanged by the failed attempts", registry().length === 3);

// ================================================================ 6. existing behaviour
console.log("\n6. Existing behaviour");
const members = await ws.listWorkspaceMembers(a.workspace.id);
check("listWorkspaceMembers still returns the owner", members.length === 1 && members[0].role === "OWNER");
const invited = await ws.inviteWorkspaceUser(a.workspace.id, { firstName: "Ivy", surname: "User", email: "ivy@example.test", mobile: "", role: "VIEW_ONLY", method: "password", password: "Isolated-Test-Pass-2" }).catch((e) => e);
check("inviting a non-owner user still works and adds no registry row", !(invited instanceof Error) && registry().length === 3, invited instanceof Error ? invited.message : "");
const dup2 = await expectThrow(() => ws.createClientWorkspace({ ...client("Epsilon", "e@example.test"), packageName: "Platinum" }));
check("unknown package still refused before any write", Boolean(dup2?.startsWith("Unknown package")) && companiesNamed("Epsilon") === 0);
psql(`delete from public.vyron_cost_companies where id = '${c.workspace.companyId}'`);
check("deleting a company cascades its registry row only", registry().length === 2 && !registry().some((r) => r.company_id === c.workspace.companyId));
const orphanEmails = [...authUsers.values()].map((u) => u.email).filter((e) => ["pre@example.test", "owner.delta@example.test"].includes(e)).sort();
check("EXISTING behaviour (unchanged, disclosed): a rolled-back creation removes company + workspace but leaves its auth user", JSON.stringify(orphanEmails) === JSON.stringify(["owner.delta@example.test", "pre@example.test"]), JSON.stringify([...authUsers.values()].map((u) => u.email)));

server.close();
console.log(`\n${pass}/${pass + fail} checks passed.${fail ? " FAILURES PRESENT." : ""}`);
console.log("Isolated database and PostgREST only. The auth API is an in-memory stand-in.");
process.exit(fail ? 1 : 0);
