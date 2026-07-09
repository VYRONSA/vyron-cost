import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${appBase}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { _raw: raw.slice(0, 800) };
  }
  return { status: response.status, ok: response.ok, data, raw };
}

async function createWorkspaceOwner() {
  const stamp = Date.now();
  const email = `intelligence-owner-${stamp}@example.com`;
  const password = "Intelligence123!";

  const auth = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Intel", surname: "Owner" },
  });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "Failed to create auth user");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Intelligence Cert ${stamp}`, trading_name: `Intelligence Cert ${stamp}` })
    .select("id,name,trading_name")
    .single();
  if (company.error) throw company.error;

  const workspace = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.data.id,
      company_name: company.data.name,
      trading_name: company.data.trading_name,
      package_name: "Enterprise",
      status: "Live",
      user_limit: 20,
      owner_user_id: userId,
      contact_email: email,
    })
    .select("id")
    .single();
  if (workspace.error) throw workspace.error;

  const profile = await supabase.from("vyron_user_profiles").upsert(
    {
      id: userId,
      email,
      first_name: "Intel",
      surname: "Owner",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profile.error) throw profile.error;

  const membership = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.data.id,
    user_id: userId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (membership.error && !String(membership.error.message || "").includes("duplicate key")) {
    throw membership.error;
  }

  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);

  return {
    userId,
    companyId: company.data.id,
    workspaceId: workspace.data.id,
    cookies: cookieHeader(login.data.client, login.data.session),
  };
}

async function cleanup(ctx) {
  if (!ctx) return;
  try {
    if (ctx.workspaceId) {
      await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", ctx.workspaceId);
      await supabase.from("vyron_workspaces").delete().eq("id", ctx.workspaceId);
    }
  } catch {}
  try {
    if (ctx.companyId) await supabase.from("vyron_cost_companies").delete().eq("id", ctx.companyId);
  } catch {}
  try {
    if (ctx.userId) await supabase.from("vyron_user_profiles").delete().eq("id", ctx.userId);
  } catch {}
  try {
    if (ctx.userId) await supabase.auth.admin.deleteUser(ctx.userId);
  } catch {}
}

const checks = new Map();
function mark(name, ok, detail) {
  checks.set(name, { ok, detail });
}

async function main() {
  let ctx = null;

  try {
    ctx = await createWorkspaceOwner();
    const authHeaders = { Cookie: ctx.cookies };

    const forecastGet = await api("/api/demand-forecast", { headers: authHeaders }, ctx.cookies);
    mark("Demand Forecast GET", Boolean(forecastGet.data?.ok), forecastGet.data?.error || forecastGet.status);

    const forecastPost = await api("/api/demand-forecast", { method: "POST", headers: authHeaders }, ctx.cookies);
    mark("Demand Forecast Persist", Boolean(forecastPost.data?.ok), forecastPost.data?.error || forecastPost.status);

    const procurementForecast = await api("/api/demand-forecast/procurement", { headers: authHeaders }, ctx.cookies);
    mark("Demand Forecast Procurement", Boolean(procurementForecast.data?.ok), procurementForecast.data?.error || procurementForecast.status);

    const storeForecast = await api("/api/demand-forecast/stores", { headers: authHeaders }, ctx.cookies);
    const storeForecastFeatureGated = String(storeForecast.data?.error || "").includes("Feature not included");
    mark(
      "Demand Forecast Stores",
      Boolean(storeForecast.data?.ok || storeForecastFeatureGated),
      storeForecast.data?.error || storeForecast.status
    );

    const aiInsightsGet = await api("/api/cost-ai-insights", { headers: authHeaders }, ctx.cookies);
    mark("AI Dashboards Insights GET", Boolean(aiInsightsGet.data?.ok), aiInsightsGet.data?.error || aiInsightsGet.status);

    const aiInsightsPost = await api("/api/cost-ai-insights", { method: "POST", headers: authHeaders }, ctx.cookies);
    mark("AI Dashboards Insights Persist", Boolean(aiInsightsPost.data?.ok), aiInsightsPost.data?.error || aiInsightsPost.status);

    const notificationAlerts = await api("/api/inventory/alerts", { headers: authHeaders }, ctx.cookies);
    mark("Notifications Alerts API", Boolean(notificationAlerts.data?.ok), notificationAlerts.data?.error || notificationAlerts.status);

    const enterpriseSearch = await api("/api/enterprise-platform/search?q=margin");
    mark("Advanced Search Enterprise", Boolean(enterpriseSearch.data?.ok && Array.isArray(enterpriseSearch.data?.results)), enterpriseSearch.data?.error || enterpriseSearch.status);

    const auditorSearch = await api("/api/enterprise/auditor-search?q=risk");
    mark("Advanced Search Auditor", Boolean(auditorSearch.data?.ok && Array.isArray(auditorSearch.data?.results)), auditorSearch.data?.error || auditorSearch.status);

    const executiveCommand = await api("/api/executive/command-centre", { headers: authHeaders }, ctx.cookies);
    mark("AI Dashboards Executive Command", Boolean(executiveCommand.data?.ok), executiveCommand.data?.error || executiveCommand.status);

    const pageBusinessHealth = await api("/business-health", { headers: authHeaders }, ctx.cookies);
    mark("Business Health Page", pageBusinessHealth.status === 200, `status=${pageBusinessHealth.status}`);

    const pageRootCause = await api("/root-cause", { headers: authHeaders }, ctx.cookies);
    mark("Root Cause Page", pageRootCause.status === 200, `status=${pageRootCause.status}`);

    const pageEarlyWarning = await api("/early-warning", { headers: authHeaders }, ctx.cookies);
    mark("Early Warning Page", pageEarlyWarning.status === 200, `status=${pageEarlyWarning.status}`);

    const pageDemandForecast = await api("/demand-forecast", { headers: authHeaders }, ctx.cookies);
    mark("Demand Forecasting Page", pageDemandForecast.status === 200, `status=${pageDemandForecast.status}`);

    const pageAlerts = await api("/alerts", { headers: authHeaders }, ctx.cookies);
    mark("Notifications Page", pageAlerts.status === 200, `status=${pageAlerts.status}`);

    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail ?? ""}`);
    }

    const allPass = Array.from(checks.values()).every((entry) => entry.ok);
    console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
    process.exit(allPass ? 0 : 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FATAL:", message);
    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail ?? ""}`);
    }
    console.log("OVERALL: FAIL");
    process.exit(1);
  } finally {
    await cleanup(ctx);
  }
}

main();
