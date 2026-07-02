import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.PERMISSION_TEST_BASE || "http://localhost:3007";

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function limitedPermissions() {
  const keys = [
    "dashboard.view",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "suppliers.delete",
    "products.view",
    "admin.users",
  ];
  return Object.fromEntries(keys.map((key) => [key, key === "dashboard.view" || key === "suppliers.view"]));
}

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.cookie = cookies;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `perm-owner-${stamp}@example.com`;
  const limitedEmail = `perm-limited-${stamp}@example.com`;
  const password = "PermTest123!";
  const limitedPassword = "Limited123!";

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Perm Co ${stamp}`, trading_name: "Perm Co", contact_email: ownerEmail })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const { data: workspace, error: wsError } = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.id,
      company_name: `Perm Co ${stamp}`,
      trading_name: "Perm Co",
      package_name: "Professional",
      status: "Live",
      user_limit: 5,
      contact_email: ownerEmail,
      owner_first_name: "Perm",
      owner_surname: "Owner",
      owner_email: ownerEmail,
      owner_login_method: "password",
      owner_login_status: "pending_activation",
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const ownerPatch = await fetch(`${base}/api/developer/clients/${workspace.id}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "password",
      admin: { firstName: "Perm", surname: "Owner", email: ownerEmail, mobile: "0821111111" },
      loginSetup: { method: "password", password },
    }),
  }).then((r) => r.json());
  if (!ownerPatch.ok) throw new Error(`Owner setup failed: ${ownerPatch.error}`);

  const { data: limitedAuth, error: limitedAuthError } = await supabase.auth.admin.createUser({
    email: limitedEmail,
    password: limitedPassword,
    email_confirm: true,
    user_metadata: { first_name: "Limited", surname: "User" },
  });
  if (limitedAuthError || !limitedAuth.user?.id) {
    throw limitedAuthError || new Error("Limited auth createUser failed");
  }

  const limitedUserId = limitedAuth.user.id;
  await supabase.from("vyron_user_profiles").upsert({
    id: limitedUserId,
    email: limitedEmail,
    first_name: "Limited",
    surname: "User",
    status: "Active",
    updated_at: new Date().toISOString(),
  });

  await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.id,
    user_id: limitedUserId,
    role: "VIEW_ONLY",
    status: "Active",
    permissions: limitedPermissions(),
    joined_at: new Date().toISOString(),
  });

  const limitedLogin = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: limitedEmail, password: limitedPassword }),
  }).then((r) => r.json());
  if (!limitedLogin.ok) throw new Error(`Limited login failed: ${limitedLogin.error}`);

  const cookies = cookieHeader(limitedLogin.client, limitedLogin.session);
  const perms = limitedLogin.session.permissions;
  const checks = [];

  checks.push(["session has dashboard.view", Boolean(perms["dashboard.view"])]);
  checks.push(["session has suppliers.view", Boolean(perms["suppliers.view"])]);
  checks.push(["session denies products.view", !perms["products.view"]]);
  checks.push(["session denies admin.users", !perms["admin.users"]]);

  const suppliersGet = await api("/api/suppliers", {}, cookies);
  checks.push(["GET /api/suppliers allowed", suppliersGet.status === 200 && suppliersGet.data.ok]);

  const suppliersPost = await api(
    "/api/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_name: "Blocked Supplier" }),
    },
    cookies
  );
  checks.push(["POST /api/suppliers blocked", suppliersPost.status === 403]);

  const productsGet = await api("/api/products", {}, cookies);
  checks.push(["GET /api/products blocked", productsGet.status === 403]);

  const ownerLogin = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password }),
  }).then((r) => r.json());
  if (!ownerLogin.ok) throw new Error(`Owner login failed: ${ownerLogin.error}`);

  const ownerCookies = cookieHeader(ownerLogin.client, ownerLogin.session);
  const ownerSuppliersPost = await api(
    "/api/suppliers",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_name: `Owner Supplier ${stamp}` }),
    },
    ownerCookies
  );
  checks.push(["Owner POST /api/suppliers allowed", ownerSuppliersPost.status === 200 && ownerSuppliersPost.data.ok]);

  let failed = 0;
  for (const [label, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"} — ${label}`);
    if (!pass) failed += 1;
  }

  if (failed) {
    console.error(`\n${failed} permission test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll permission API tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
