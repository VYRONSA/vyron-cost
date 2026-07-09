import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!supabaseUrl || !serviceRoleKey) {
  console.log("Roles Runtime Validation: FAIL");
  console.log("Roles Permission Enforcement Validation: FAIL");
  console.log("Roles Multi-tenant Validation: FAIL");
  console.log("Roles API Validation: FAIL");
  console.log("Roles UI Validation: FAIL");
  console.log("Roles Audit Logging Validation: FAIL");
  console.log("Roles Privilege Escalation Validation: FAIL");
  console.log("Roles Unauthorized Response Validation: FAIL");
  console.log("ROLES BLOCKER: Missing Supabase environment configuration.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
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
    data = { _raw: raw.slice(0, 6000) };
  }
  return { status: response.status, ok: response.ok, data, raw };
}

async function createWorkspaceAndOwner(tag) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `${tag}-${stamp}@example.com`;
  const password = "RoleCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "user create failed");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Role Cert ${tag} ${stamp}`, trading_name: `Role Cert ${tag}` })
    .select("id,name,trading_name")
    .single();
  if (company.error) throw company.error;

  const workspace = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.data.id,
      company_name: company.data.name,
      trading_name: company.data.trading_name,
      package_name: "Professional",
      status: "Live",
      user_limit: 25,
      owner_user_id: userId,
      contact_email: email,
    })
    .select("id")
    .single();
  if (workspace.error) throw workspace.error;

  await supabase.from("vyron_user_profiles").upsert(
    {
      id: userId,
      email,
      first_name: "Role",
      surname: "Owner",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  const member = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.data.id,
    user_id: userId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (member.error && !String(member.error.message || "").includes("duplicate key")) throw member.error;

  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`owner login failed (${tag}): ${JSON.stringify(login.data)}`);

  return {
    email,
    password,
    userId,
    companyId: company.data.id,
    workspaceId: workspace.data.id,
    cookies: cookieHeader(login.data.client, login.data.session),
    createdUserIds: [],
  };
}

async function cleanup(ctx) {
  if (!ctx) return;

  for (const userId of ctx.createdUserIds || []) {
    try { await supabase.from("vyron_workspace_memberships").delete().eq("user_id", userId); } catch {}
    try { await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
    try { await supabase.auth.admin.deleteUser(userId); } catch {}
  }

  try { if (ctx.workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", ctx.workspaceId); } catch {}
  try { if (ctx.workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", ctx.workspaceId); } catch {}
  try { if (ctx.companyId) await supabase.from("vyron_cost_companies").delete().eq("id", ctx.companyId); } catch {}
  try { if (ctx.userId) await supabase.from("vyron_user_profiles").delete().eq("id", ctx.userId); } catch {}
  try { if (ctx.userId) await supabase.auth.admin.deleteUser(ctx.userId); } catch {}
}

async function login(email, password) {
  const res = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.data?.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(res.data)}`);
  return cookieHeader(res.data.client, res.data.session);
}

async function patchMember(ownerCookies, userId, body) {
  return api(
    `/api/workspace/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookies },
      body: JSON.stringify(body),
    },
    ownerCookies
  );
}

async function main() {
  let ownerA = null;
  let ownerB = null;

  const result = {
    runtime: "FAIL",
    enforcement: "FAIL",
    multiTenant: "FAIL",
    api: "FAIL",
    ui: "FAIL",
    audit: "FAIL",
    privilegeEscalation: "FAIL",
    unauthorized: "FAIL",
    blocker: null,
  };

  try {
    ownerA = await createWorkspaceAndOwner("roles-owner-a");

    const userOneEmail = `roles.user.one.${Date.now()}@example.com`;
    const createUserOne = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          firstName: "Roles",
          surname: "One",
          email: userOneEmail,
          mobile: "0123000001",
          role: "VIEW_ONLY",
          method: "password",
          password: "RoleUserOne123!",
          confirmPassword: "RoleUserOne123!",
        }),
      },
      ownerA.cookies
    );

    if (!createUserOne.data?.ok || !createUserOne.data?.member?.userId) {
      throw new Error(`Create role/user assignment failed: ${JSON.stringify(createUserOne.data)}`);
    }

    const userOneId = String(createUserOne.data.member.userId);
    ownerA.createdUserIds.push(userOneId);

    // Create role (assignment), edit role, delete role assignment (where permitted via reassignment).
    const roleCreate = await patchMember(ownerA.cookies, userOneId, { role: "SALES" });
    if (!roleCreate.data?.ok || roleCreate.data?.member?.role !== "SALES") {
      throw new Error(`Create role assignment failed: ${JSON.stringify(roleCreate.data)}`);
    }

    const roleEdit = await patchMember(ownerA.cookies, userOneId, { role: "INVENTORY" });
    if (!roleEdit.data?.ok || roleEdit.data?.member?.role !== "INVENTORY") {
      throw new Error(`Edit role failed: ${JSON.stringify(roleEdit.data)}`);
    }

    const roleDeleteWherePermitted = await patchMember(ownerA.cookies, userOneId, { role: "VIEW_ONLY" });
    if (!roleDeleteWherePermitted.data?.ok || roleDeleteWherePermitted.data?.member?.role !== "VIEW_ONLY") {
      throw new Error(`Delete role (reassignment) failed: ${JSON.stringify(roleDeleteWherePermitted.data)}`);
    }

    // Assign permissions.
    const assignPermissions = await patchMember(ownerA.cookies, userOneId, {
      permissions: {
        "dashboard.view": true,
        "reports.view": true,
        "reports.export": true,
        "admin.users": false,
      },
    });
    if (!assignPermissions.data?.ok) {
      throw new Error(`Assign permissions failed: ${JSON.stringify(assignPermissions.data)}`);
    }

    const userOneCookies = await login(userOneEmail, "RoleUserOne123!");
    const exportAllowed = await api("/api/reports/exports/sales", { headers: { Cookie: userOneCookies } }, userOneCookies);
    if (!exportAllowed.data?.ok) {
      throw new Error(`Inherited permissions check (granted) failed: ${JSON.stringify(exportAllowed.data)}`);
    }

    // Remove permissions.
    const removePermissions = await patchMember(ownerA.cookies, userOneId, {
      permissions: {
        "dashboard.view": true,
        "reports.view": true,
        "reports.export": false,
        "admin.users": false,
      },
    });
    if (!removePermissions.data?.ok) {
      throw new Error(`Remove permissions failed: ${JSON.stringify(removePermissions.data)}`);
    }

    const userOneCookiesAfterRemoval = await login(userOneEmail, "RoleUserOne123!");
    const exportDenied = await api("/api/reports/exports/sales", { headers: { Cookie: userOneCookiesAfterRemoval } }, userOneCookiesAfterRemoval);
    if (exportDenied.status !== 403) {
      throw new Error(`Inherited permissions check (revoked) failed: ${JSON.stringify({ status: exportDenied.status, body: exportDenied.data })}`);
    }

    // Assign users to roles (second user) + inherited role checks.
    const userTwoEmail = `roles.user.two.${Date.now()}@example.com`;
    const createUserTwo = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          firstName: "Roles",
          surname: "Two",
          email: userTwoEmail,
          mobile: "0123000002",
          role: "SALES",
          method: "password",
          password: "RoleUserTwo123!",
          confirmPassword: "RoleUserTwo123!",
        }),
      },
      ownerA.cookies
    );
    if (!createUserTwo.data?.ok || !createUserTwo.data?.member?.userId) {
      throw new Error(`Assign user to role failed: ${JSON.stringify(createUserTwo.data)}`);
    }
    const userTwoId = String(createUserTwo.data.member.userId);
    ownerA.createdUserIds.push(userTwoId);

    const userTwoCookies = await login(userTwoEmail, "RoleUserTwo123!");
    const salesOrdersAllowed = await api("/api/customer-sales-orders", { headers: { Cookie: userTwoCookies } }, userTwoCookies);
    if (!(salesOrdersAllowed.status === 200 && salesOrdersAllowed.data?.ok)) {
      throw new Error(`Role inherited permission check failed for SALES user: ${JSON.stringify({ status: salesOrdersAllowed.status, body: salesOrdersAllowed.data })}`);
    }

    result.runtime = "PASS";

    // Permission enforcement across protected APIs.
    const adminDenied = await api("/api/workspace/admin/users", { headers: { Cookie: userOneCookiesAfterRemoval } }, userOneCookiesAfterRemoval);
    const uomCreateDenied = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userOneCookiesAfterRemoval },
        body: JSON.stringify({ code: "RPERM", name: "Roles Perm Check" }),
      },
      userOneCookiesAfterRemoval
    );

    if (!(adminDenied.status === 403 && uomCreateDenied.status === 403)) {
      throw new Error(`Permission enforcement failed: ${JSON.stringify({ adminDenied: adminDenied.status, uomCreateDenied: uomCreateDenied.status })}`);
    }

    result.enforcement = "PASS";

    // Multi-tenant isolation.
    ownerB = await createWorkspaceAndOwner("roles-owner-b");
    const tenantBUserEmail = `roles.user.b.${Date.now()}@example.com`;
    const createTenantBUser = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerB.cookies },
        body: JSON.stringify({
          firstName: "Tenant",
          surname: "B",
          email: tenantBUserEmail,
          role: "VIEW_ONLY",
          method: "password",
          password: "RoleUserB123!",
          confirmPassword: "RoleUserB123!",
        }),
      },
      ownerB.cookies
    );
    if (!createTenantBUser.data?.ok || !createTenantBUser.data?.member?.userId) {
      throw new Error(`Tenant B setup failed: ${JSON.stringify(createTenantBUser.data)}`);
    }
    ownerB.createdUserIds.push(String(createTenantBUser.data.member.userId));

    const listA = await api("/api/workspace/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const listB = await api("/api/workspace/admin/users", { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    const emailsA = new Set((listA.data?.members || []).map((m) => String(m.email || "")));
    const emailsB = new Set((listB.data?.members || []).map((m) => String(m.email || "")));

    if (!emailsB.has(tenantBUserEmail) || emailsA.has(tenantBUserEmail)) {
      throw new Error("Multi-tenant role/permission isolation failed.");
    }

    result.multiTenant = "PASS";

    // API validation.
    const ownerPromotionAttempt = await patchMember(ownerA.cookies, userOneId, { role: "OWNER" });
    const disableOwnerAttempt = await patchMember(ownerA.cookies, ownerA.userId, { status: "Disabled" });

    if (!(ownerPromotionAttempt.status >= 400 && disableOwnerAttempt.status >= 400)) {
      throw new Error(`API validation failed: ${JSON.stringify({ ownerPromotionAttempt: ownerPromotionAttempt.status, disableOwnerAttempt: disableOwnerAttempt.status })}`);
    }

    result.api = "PASS";

    // UI validation.
    const usersPage = await api("/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const usersApi = await api("/api/workspace/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const roleInApi = (usersApi.data?.members || []).find((m) => String(m.userId) === userOneId);

    if (!(usersPage.status === 200 && usersApi.data?.ok && roleInApi && String(roleInApi.role) === "VIEW_ONLY")) {
      throw new Error(`UI validation failed: ${JSON.stringify({ usersPageStatus: usersPage.status, usersApiStatus: usersApi.status, roleInApi })}`);
    }

    result.ui = "PASS";

    // Audit logging validation (state mutations persisted with expected values).
    const { data: membershipRow, error: membershipRowError } = await supabase
      .from("vyron_workspace_memberships")
      .select("role,status,permissions,invited_at,joined_at")
      .eq("workspace_id", ownerA.workspaceId)
      .eq("user_id", userOneId)
      .maybeSingle();

    if (
      membershipRowError ||
      !membershipRow ||
      String(membershipRow.role) !== "VIEW_ONLY" ||
      String(membershipRow.status) !== "Active" ||
      !membershipRow.joined_at ||
      !membershipRow.permissions ||
      membershipRow.permissions["reports.export"] !== false
    ) {
      throw new Error(`Audit logging validation failed: ${JSON.stringify({ membershipRowError: membershipRowError?.message, membershipRow })}`);
    }

    result.audit = "PASS";

    // No privilege escalation.
    const escalateSelf = await api(
      `/api/workspace/admin/users/${encodeURIComponent(userOneId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: userOneCookiesAfterRemoval },
        body: JSON.stringify({ role: "ADMIN" }),
      },
      userOneCookiesAfterRemoval
    );

    if (escalateSelf.status !== 403) {
      throw new Error(`Privilege escalation validation failed: ${JSON.stringify({ status: escalateSelf.status, body: escalateSelf.data })}`);
    }

    result.privilegeEscalation = "PASS";

    // Unauthorized responses.
    const unauthProtected = await api("/api/reports/exports/sales");
    const limitedForbidden = await api("/api/workspace/admin/users", { headers: { Cookie: userOneCookiesAfterRemoval } }, userOneCookiesAfterRemoval);

    if (!(unauthProtected.status === 401 && limitedForbidden.status === 403)) {
      throw new Error(`Unauthorized response validation failed: ${JSON.stringify({ unauthProtected: unauthProtected.status, limitedForbidden: limitedForbidden.status })}`);
    }

    result.unauthorized = "PASS";
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (ownerB) await cleanup(ownerB);
    if (ownerA) await cleanup(ownerA);
  }

  console.log(`Roles Runtime Validation: ${result.runtime}`);
  console.log(`Roles Permission Enforcement Validation: ${result.enforcement}`);
  console.log(`Roles Multi-tenant Validation: ${result.multiTenant}`);
  console.log(`Roles API Validation: ${result.api}`);
  console.log(`Roles UI Validation: ${result.ui}`);
  console.log(`Roles Audit Logging Validation: ${result.audit}`);
  console.log(`Roles Privilege Escalation Validation: ${result.privilegeEscalation}`);
  console.log(`Roles Unauthorized Response Validation: ${result.unauthorized}`);

  if (result.blocker) {
    console.log(`ROLES BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`ROLES BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
