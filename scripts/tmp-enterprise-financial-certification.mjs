import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx);
  const value = line.slice(idx + 1).replace(/^"|"$/g, "");
  process.env[key] = value;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env configuration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(module, runtimeStep, rootCause, exactFile, smallestFix) {
  console.log(JSON.stringify({ module, runtimeStep, rootCause, exactFile, smallestFix }, null, 2));
  process.exit(2);
}

function cookieHeader(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${appBase}${path}`, { ...options, headers });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, module, runtimeStep, rootCause, exactFile, smallestFix) {
  if (!condition) fail(module, runtimeStep, rootCause, exactFile, smallestFix);
}

function hasDupes(values) {
  const norm = values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  return new Set(norm).size !== norm.length;
}

const stamp = Date.now();
const email = `xero-cert-${stamp}@example.com`;
const password = "Probe123!";
let userId = null;
let workspaceId = null;

try {
  const { data: rows, error: wsErr } = await supabase
    .from("vyron_xero_workspace_settings")
    .select("workspace_id, connection")
    .limit(100);
  if (wsErr) {
    fail(
      "Chart of Accounts Sync",
      "Load connected Xero workspace",
      wsErr.message,
      "src/lib/vyron-xero-connection-store.ts",
      "Ensure vyron_xero_workspace_settings is readable with service role and contains connected workspaces."
    );
  }

  const live = (rows || []).find((row) => {
    const c = row.connection || {};
    return Boolean(UUID_RE.test(String(row.workspace_id || "").trim()) && c.connected && c.accessToken && c.refreshToken && c.tenantId && c.tenantId !== "—");
  });

  assert(
    Boolean(live?.workspace_id),
    "Chart of Accounts Sync",
    "Find workspace with live Xero connection",
    "No connected workspace with tokens found.",
    "src/lib/vyron-xero-connection-store.ts",
    "Connect at least one workspace to Xero and persist tokens in vyron_xero_workspace_settings before certification."
  );

  workspaceId = live.workspace_id;
  const tenantId = String(live.connection.tenantId);

  const ws = await supabase
    .from("vyron_workspaces")
    .select("id, company_id")
    .eq("id", workspaceId)
    .maybeSingle();
  assert(
    !ws.error && Boolean(ws.data?.company_id),
    "Chart of Accounts Sync",
    "Resolve workspace/company scope",
    ws.error?.message || "Workspace or company_id missing for selected Xero workspace.",
    "src/lib/vyron-xero-api-context.ts",
    "Ensure connected Xero workspace has valid vyron_workspaces.company_id and API context resolution."
  );

  const user = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  assert(
    !user.error && Boolean(user.data.user?.id),
    "Chart of Accounts Sync",
    "Create certification user",
    user.error?.message || "Could not create runtime probe user.",
    "scripts/tmp-enterprise-financial-certification.mjs",
    "Allow admin user creation in certification environment or provide existing test user credentials."
  );
  userId = user.data.user.id;

  const profileUpsert = await supabase
    .from("vyron_user_profiles")
    .upsert(
      {
        id: userId,
        email,
        first_name: "Xero",
        surname: "Cert",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  assert(
    !profileUpsert.error,
    "Chart of Accounts Sync",
    "Prepare user profile",
    profileUpsert.error?.message || "Failed to upsert user profile.",
    "src/lib/vyron-workspace-session.ts",
    "Ensure workspace login dependencies include vyron_user_profiles for newly created users."
  );

  const membership = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspaceId,
    user_id: userId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  assert(
    !membership.error,
    "Chart of Accounts Sync",
    "Grant workspace membership",
    membership.error?.message || "Failed to create workspace membership.",
    "src/lib/vyron-workspace-access.ts",
    "Ensure certification user can be granted OWNER role in target workspace."
  );

  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  assert(
    login.data?.ok && login.data?.client && login.data?.session,
    "Chart of Accounts Sync",
    "Authenticate certification user",
    JSON.stringify(login.data),
    "src/app/api/workspace/login/route.ts",
    "Fix workspace login session creation for valid workspace users."
  );

  const cookies = cookieHeader(login.data.client, login.data.session);

  const before = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
  assert(
    before.data?.ok,
    "Chart of Accounts Sync",
    "Load account catalog before sync",
    JSON.stringify(before.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix account catalog GET for authenticated workspace context."
  );

  const autoSync = await api(
    "/api/integrations/xero/connection",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select-organisation", tenantId }),
    },
    cookies
  );

  assert(
    autoSync.data?.ok,
    "Chart of Accounts Sync",
    "Automatic sync trigger after organisation selection",
    JSON.stringify(autoSync.data),
    "src/app/api/integrations/xero/connection/route.ts",
    "Fix organisation selection action to allow connected workspace users and trigger account sync."
  );

  const manualSync = await api(
    "/api/integrations/xero/accounts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-from-xero" }),
    },
    cookies
  );

  assert(
    manualSync.data?.ok,
    "Chart of Accounts Sync",
    "Manual refresh chart of accounts",
    JSON.stringify(manualSync.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix sync-from-xero action and permission flow for connected workspaces."
  );

  const catalog = manualSync.data?.accountCatalog?.accounts || [];
  assert(
    Array.isArray(catalog) && catalog.length > 0,
    "Chart of Accounts Sync",
    "Validate synced account payload",
    "No accounts returned after sync.",
    "src/lib/vyron-financial-engine.ts",
    "Ensure Xero /Accounts fetch returns ACTIVE records and catalog response includes synced rows."
  );

  const statuses = catalog.map((a) => String(a?.status || "").toUpperCase());
  assert(
    statuses.every((s) => s === "ACTIVE"),
    "Chart of Accounts Sync",
    "Validate ACTIVE-only account import",
    "Catalog contains non-ACTIVE accounts.",
    "src/lib/vyron-financial-engine.ts",
    "Filter imported Xero accounts to ACTIVE status before UPSERT."
  );

  const extIds = catalog.map((a) => a?.accountId || null);
  const codes = catalog.map((a) => a?.accountCode || null);

  assert(
    !hasDupes(extIds),
    "Chart of Accounts Sync",
    "Validate no duplicate external accounts",
    "Duplicate external account IDs detected after sync.",
    "src/lib/vyron-financial-engine.ts",
    "Deduplicate by external_account_id before UPSERT and enforce conflict key."
  );

  assert(
    !hasDupes(codes),
    "Chart of Accounts Sync",
    "Validate no duplicate account codes",
    "Duplicate account codes detected in returned catalog.",
    "src/lib/vyron-financial-engine.ts",
    "Ensure conflict handling keeps one row per external account and code per scoped company."
  );

  console.log(JSON.stringify({ chartSync: "PASS", workspaceId, accountCount: catalog.length }, null, 2));
} finally {
  try {
    if (workspaceId && userId) {
      await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    }
  } catch {}
  try {
    if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId);
  } catch {}
  try {
    if (userId) await supabase.auth.admin.deleteUser(userId);
  } catch {}
}
