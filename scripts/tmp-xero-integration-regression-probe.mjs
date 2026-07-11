import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env configuration.");

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function fail(step, detail) {
  console.log(JSON.stringify({ ok: false, step, detail }, null, 2));
  process.exit(2);
}

function cookieHeader(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${appBase}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

const stamp = Date.now();
const email = `xero-reg-${stamp}@example.com`;
const password = "Probe123!";
let userId = null;
let workspaceId = null;

try {
  const rows = await supabase.from("vyron_xero_workspace_settings").select("workspace_id, connection").limit(100);
  if (rows.error) fail("load_workspace_settings", rows.error.message);

  const live = (rows.data || []).find((row) => {
    const id = String(row.workspace_id || "").trim();
    const c = row.connection || {};
    return UUID_RE.test(id) && c.connected && c.tenantId && c.tenantId !== "—";
  });
  if (!live?.workspace_id) fail("select_workspace", "No UUID scoped connected workspace found.");

  workspaceId = String(live.workspace_id);
  const tenantId = String(live.connection.tenantId);

  const u = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error || !u.data.user?.id) fail("create_user", u.error?.message || "failed");
  userId = u.data.user.id;

  await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "Xero", surname: "Reg", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const m = await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });
  if (m.error) fail("grant_membership", m.error.message);

  const login = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!login.data?.ok || !login.data.client || !login.data.session) fail("login", JSON.stringify(login.data));
  const cookies = cookieHeader(login.data.client, login.data.session);

  const connection = await api("/api/integrations/xero/connection", { method: "GET" }, cookies);
  if (!connection.data?.ok) fail("connection_get", JSON.stringify(connection.data));

  const refresh = await api("/api/integrations/xero/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh-token" }) }, cookies);
  if (!refresh.data?.ok) fail("refresh_token", JSON.stringify(refresh.data));

  const selectOrg = await api("/api/integrations/xero/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-organisation", tenantId }) }, cookies);
  if (!selectOrg.data?.ok) fail("select_organisation", JSON.stringify(selectOrg.data));

  const manualRefresh = await api("/api/integrations/xero/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync-from-xero" }) }, cookies);
  if (!manualRefresh.data?.ok) fail("manual_chart_refresh", JSON.stringify(manualRefresh.data));

  const syncCustomers = await api("/api/integrations/xero/sync-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync-all-customers-now" }) }, cookies);
  if (!syncCustomers.data?.ok) fail("sync_all_customers", JSON.stringify(syncCustomers.data));

  const syncSuppliers = await api("/api/integrations/xero/sync-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync-all-suppliers-now" }) }, cookies);
  if (!syncSuppliers.data?.ok) fail("sync_all_suppliers", JSON.stringify(syncSuppliers.data));

  const syncInvoices = await api("/api/integrations/xero/sync-queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync-all-invoices-now" }) }, cookies);
  if (!syncInvoices.data?.ok) fail("sync_all_invoices", JSON.stringify(syncInvoices.data));

  console.log(JSON.stringify({ ok: true }, null, 2));
} finally {
  try { if (workspaceId && userId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId); } catch {}
  try { if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
  try { if (userId) await supabase.auth.admin.deleteUser(userId); } catch {}
}
