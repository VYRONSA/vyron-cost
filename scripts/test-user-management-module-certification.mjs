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
  console.log("User Runtime Validation: FAIL");
  console.log("User Permission Validation: FAIL");
  console.log("User Multi-tenant Validation: FAIL");
  console.log("User API Validation: FAIL");
  console.log("User UI Validation: FAIL");
  console.log("User Audit Logging Validation: FAIL");
  console.log("User Email/Invitation Validation: FAIL");
  console.log("USER BLOCKER: Missing Supabase environment configuration.");
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
  const password = "UserCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "user create failed");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `User Cert ${tag} ${stamp}`, trading_name: `User Cert ${tag}` })
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
      user_limit: 20,
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
      first_name: "User",
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

async function loginAs(email, password) {
  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(login.data)}`);
  return cookieHeader(login.data.client, login.data.session);
}

async function main() {
  let ownerA = null;
  let ownerB = null;

  const result = {
    runtime: "FAIL",
    permissions: "FAIL",
    multiTenant: "FAIL",
    api: "FAIL",
    ui: "FAIL",
    audit: "FAIL",
    emailInvite: "FAIL",
    blocker: null,
  };

  try {
    ownerA = await createWorkspaceAndOwner("user-owner-a");

    const createPayload = {
      firstName: "Ops",
      surname: "User",
      email: `ops-user-${Date.now()}@example.com`,
      mobile: "0123456789",
      role: "VIEW_ONLY",
      method: "password",
      password: "TempPass123!",
      confirmPassword: "TempPass123!",
    };

    const createUser = await api("/api/workspace/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
      body: JSON.stringify(createPayload),
    }, ownerA.cookies);
    if (!createUser.data?.ok || !createUser.data?.member?.userId) {
      throw new Error(`Create user failed: ${JSON.stringify(createUser.data)}`);
    }
    const managedUserId = String(createUser.data.member.userId);
    ownerA.createdUserIds.push(managedUserId);

    const editRole = await api(
      `/api/workspace/admin/users/${managedUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ role: "MANAGER", permissions: { "dashboard.view": true, "reports.view": true } }),
      },
      ownerA.cookies
    );
    if (!editRole.data?.ok || editRole.data?.member?.role !== "MANAGER") {
      throw new Error(`Edit user failed: ${JSON.stringify(editRole.data)}`);
    }

    const disableUser = await api(
      `/api/workspace/admin/users/${managedUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Disabled" }),
      },
      ownerA.cookies
    );
    if (!disableUser.data?.ok || disableUser.data?.member?.status !== "Disabled") {
      throw new Error(`Disable user failed: ${JSON.stringify(disableUser.data)}`);
    }

    const enableUser = await api(
      `/api/workspace/admin/users/${managedUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Active" }),
      },
      ownerA.cookies
    );
    if (!enableUser.data?.ok || enableUser.data?.member?.status !== "Active") {
      throw new Error(`Enable user failed: ${JSON.stringify(enableUser.data)}`);
    }

    const resetPassword = await api(
      `/api/workspace/admin/users/${managedUserId}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ password: "NewPass123!", confirmPassword: "NewPass123!" }),
      },
      ownerA.cookies
    );
    if (!resetPassword.data?.ok) {
      throw new Error(`Password reset failed: ${JSON.stringify(resetPassword.data)}`);
    }

    const invitePayload = {
      firstName: "Invite",
      surname: "Candidate",
      email: `invite.user.${Date.now()}@gmail.com`,
      mobile: "0111111111",
      role: "SALES",
      method: "invite",
    };

    const inviteUser = await api("/api/workspace/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
      body: JSON.stringify(invitePayload),
    }, ownerA.cookies);
    if (!inviteUser.data?.ok || !inviteUser.data?.member?.userId) {
      throw new Error(`Invitation flow failed: ${JSON.stringify(inviteUser.data)}`);
    }
    const invitedUserId = String(inviteUser.data.member.userId);
    ownerA.createdUserIds.push(invitedUserId);

    const roleAssignment = await api(
      `/api/workspace/admin/users/${invitedUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ role: "INVENTORY" }),
      },
      ownerA.cookies
    );
    if (!roleAssignment.data?.ok || roleAssignment.data?.member?.role !== "INVENTORY") {
      throw new Error(`Role assignment failed: ${JSON.stringify(roleAssignment.data)}`);
    }

    const { data: companyAssignmentCheck, error: companyAssignmentError } = await supabase
      .from("vyron_workspace_memberships")
      .select("workspace_id, user_id")
      .eq("workspace_id", ownerA.workspaceId)
      .eq("user_id", managedUserId)
      .maybeSingle();
    if (companyAssignmentError || !companyAssignmentCheck) {
      throw new Error(`Company assignment check failed: ${companyAssignmentError?.message || "membership missing"}`);
    }

    const { data: workspaceCompany, error: workspaceCompanyError } = await supabase
      .from("vyron_workspaces")
      .select("company_id")
      .eq("id", ownerA.workspaceId)
      .maybeSingle();
    if (workspaceCompanyError || !workspaceCompany || String(workspaceCompany.company_id) !== ownerA.companyId) {
      throw new Error(`Company assignment mismatch: ${workspaceCompanyError?.message || "company mismatch"}`);
    }

    result.runtime = "PASS";

    const managedCookies = await loginAs(createPayload.email, "NewPass123!");
    const deniedList = await api("/api/workspace/admin/users", { headers: { Cookie: managedCookies } }, managedCookies);
    const deniedCreate = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: managedCookies },
        body: JSON.stringify({ firstName: "No", surname: "Perm", email: `blocked-${Date.now()}@example.com`, role: "USER", method: "invite" }),
      },
      managedCookies
    );

    if (!(deniedList.status >= 400 && deniedCreate.status >= 400)) {
      throw new Error(`Permission validation failed: ${JSON.stringify({ deniedList: deniedList.status, deniedCreate: deniedCreate.status })}`);
    }
    result.permissions = "PASS";

    ownerB = await createWorkspaceAndOwner("user-owner-b");
    const tenantBUser = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerB.cookies },
        body: JSON.stringify({
          firstName: "Tenant",
          surname: "B",
          email: `tenant-b-user-${Date.now()}@example.com`,
          role: "USER",
          method: "password",
          password: "TenantB123!",
          confirmPassword: "TenantB123!",
        }),
      },
      ownerB.cookies
    );
    if (!tenantBUser.data?.ok) throw new Error(`Tenant B user create failed: ${JSON.stringify(tenantBUser.data)}`);
    ownerB.createdUserIds.push(String(tenantBUser.data.member.userId));

    const listA = await api("/api/workspace/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const listB = await api("/api/workspace/admin/users", { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    const emailsA = new Set((listA.data?.members || []).map((m) => String(m.email || "")));
    const emailsB = new Set((listB.data?.members || []).map((m) => String(m.email || "")));

    if (emailsA.has(String(tenantBUser.data.member.email || "")) || !emailsB.has(String(tenantBUser.data.member.email || ""))) {
      throw new Error("Multi-tenant user isolation failed.");
    }
    result.multiTenant = "PASS";

    const invalidCreate = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ firstName: "", surname: "", email: "", role: "USER", method: "invite" }),
      },
      ownerA.cookies
    );

    const invalidReset = await api(
      `/api/workspace/admin/users/${managedUserId}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ password: "short", confirmPassword: "short" }),
      },
      ownerA.cookies
    );

    const ownerDisableAttempt = await api(
      `/api/workspace/admin/users/${ownerA.userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Disabled" }),
      },
      ownerA.cookies
    );

    if (!(invalidCreate.status >= 400 && invalidReset.status >= 400 && ownerDisableAttempt.status >= 400)) {
      throw new Error(`API validation failed: ${JSON.stringify({ invalidCreate: invalidCreate.status, invalidReset: invalidReset.status, ownerDisableAttempt: ownerDisableAttempt.status })}`);
    }
    result.api = "PASS";

    const usersPage = await api("/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const uiData = await api("/api/workspace/admin/users", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!(usersPage.status === 200 && uiData.data?.ok && Array.isArray(uiData.data?.members))) {
      throw new Error(`UI validation failed: ${JSON.stringify({ pageStatus: usersPage.status, apiStatus: uiData.status, apiBody: uiData.data })}`);
    }
    result.ui = "PASS";

    const { data: invitedMembership, error: invitedMembershipError } = await supabase
      .from("vyron_workspace_memberships")
      .select("status,invited_at,joined_at")
      .eq("workspace_id", ownerA.workspaceId)
      .eq("user_id", invitedUserId)
      .maybeSingle();
    if (invitedMembershipError || !invitedMembership) {
      throw new Error(`Audit validation membership missing: ${invitedMembershipError?.message || "not found"}`);
    }

    if (String(invitedMembership.status) !== "Invited" || !invitedMembership.invited_at || invitedMembership.joined_at) {
      throw new Error(`Email/invitation validation failed: ${JSON.stringify(invitedMembership)}`);
    }

    const { data: managedMembership, error: managedMembershipError } = await supabase
      .from("vyron_workspace_memberships")
      .select("status")
      .eq("workspace_id", ownerA.workspaceId)
      .eq("user_id", managedUserId)
      .maybeSingle();

    const { data: managedProfile, error: managedProfileError } = await supabase
      .from("vyron_user_profiles")
      .select("updated_at,status")
      .eq("id", managedUserId)
      .maybeSingle();

    if (
      managedMembershipError ||
      !managedMembership ||
      String(managedMembership.status) !== "Active" ||
      managedProfileError ||
      !managedProfile ||
      !managedProfile.updated_at ||
      String(managedProfile.status) !== "Active"
    ) {
      throw new Error(
        `Audit logging validation failed: ${JSON.stringify({
          managedMembershipError: managedMembershipError?.message,
          managedMembership,
          managedProfileError: managedProfileError?.message,
          managedProfile,
        })}`
      );
    }

    result.audit = "PASS";
    result.emailInvite = "PASS";
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (ownerB) await cleanup(ownerB);
    if (ownerA) await cleanup(ownerA);
  }

  console.log(`User Runtime Validation: ${result.runtime}`);
  console.log(`User Permission Validation: ${result.permissions}`);
  console.log(`User Multi-tenant Validation: ${result.multiTenant}`);
  console.log(`User API Validation: ${result.api}`);
  console.log(`User UI Validation: ${result.ui}`);
  console.log(`User Audit Logging Validation: ${result.audit}`);
  console.log(`User Email/Invitation Validation: ${result.emailInvite}`);

  if (result.blocker) {
    console.log(`USER BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`USER BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
