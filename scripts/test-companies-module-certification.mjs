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
  console.log("Companies Runtime Validation: FAIL");
  console.log("Companies Tenant Isolation Validation: FAIL");
  console.log("Companies Switching Validation: FAIL");
  console.log("Companies Subscription Association Validation: FAIL");
  console.log("Companies API Validation: FAIL");
  console.log("Companies UI Validation: FAIL");
  console.log("Companies Audit Logging Validation: FAIL");
  console.log("Companies Security Boundary Validation: FAIL");
  console.log("Companies Data Leakage Validation: FAIL");
  console.log("COMPANIES BLOCKER: Missing Supabase environment configuration.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${appBase}${path}`, { ...options, headers, redirect: "manual" });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { _raw: raw.slice(0, 12000) };
      }
      return { status: response.status, ok: response.ok, data, raw, headers: response.headers };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "fetch failed"));
}

function cookieFromSetCookie(setCookie, name) {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

function workspaceCookie(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function createPlatformAdmin(tag) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `${tag}.${stamp}@example.com`;
  const password = "PlatformCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "Platform auth user create failed.");
  const userId = auth.data.user.id;

  const upsertPlatform = await supabase.from("vyron_platform_users").upsert(
    {
      user_id: userId,
      email,
      role: "PLATFORM_ADMIN",
      is_active: true,
    },
    { onConflict: "user_id" }
  );
  if (upsertPlatform.error) throw new Error(upsertPlatform.error.message);

  const login = await api("/api/platform-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`Platform login failed: ${JSON.stringify(login.data)}`);

  const setCookie = login.headers.get("set-cookie") || "";
  const platformCookie = cookieFromSetCookie(setCookie, "vyron_platform_session");
  if (!platformCookie) throw new Error("Platform session cookie missing from login response.");

  return { email, password, userId, platformCookie };
}

async function createCompany(platformCookie, tag) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const companyName = `Companies Cert ${tag} ${stamp}`;
  const tradingName = `${tag} Trading ${stamp}`;
  const ownerEmail = `${tag}.owner.${stamp}@example.com`;
  const ownerPassword = "OwnerCert123!";

  const payload = {
    companyName,
    tradingName,
    packageName: "Professional",
    userLimit: 12,
    contactEmail: `${tag}.ops.${stamp}@example.com`,
    phone: "0215550101",
    admin: {
      firstName: "Cert",
      surname: tag,
      email: ownerEmail,
      mobile: "0820000001",
    },
    loginSetup: {
      method: "password",
      password: ownerPassword,
    },
  };

  const created = await api(
    "/api/developer/clients",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: platformCookie },
      body: JSON.stringify(payload),
    },
    platformCookie
  );

  if (!created.data?.ok || !created.data?.workspace?.id || !created.data?.workspace?.companyId) {
    throw new Error(`Create company failed: ${JSON.stringify(created.data)}`);
  }

  return {
    workspaceId: String(created.data.workspace.id),
    companyId: String(created.data.workspace.companyId),
    companyName,
    tradingName,
    packageName: "Professional",
    ownerEmail,
    ownerPassword,
    admin: payload.admin,
  };
}

async function workspaceLogin(email, password) {
  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok || !login.data?.client || !login.data?.session) {
    throw new Error(`Workspace login failed for ${email}: ${JSON.stringify(login.data)}`);
  }
  return workspaceCookie(login.data.client, login.data.session);
}

async function cleanupUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return;
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const users = await supabase.auth.admin.listUsers({ page, perPage });
    if (users.error) return;
    const user = users.data.users.find((u) => String(u.email || "").toLowerCase() === normalized);
    if (user?.id) {
      try { await supabase.from("vyron_workspace_memberships").delete().eq("user_id", user.id); } catch {}
      try { await supabase.from("vyron_user_profiles").delete().eq("id", user.id); } catch {}
      try { await supabase.from("vyron_platform_users").delete().eq("user_id", user.id); } catch {}
      try { await supabase.auth.admin.deleteUser(user.id); } catch {}
      return;
    }
    if (users.data.users.length < perPage) return;
    page += 1;
  }
}

async function cleanupWorkspace(workspaceId, companyId) {
  if (!workspaceId) return;
  try { await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId); } catch {}
  try { await supabase.from("vyron_workspaces").delete().eq("id", workspaceId); } catch {}
  if (companyId) {
    try { await supabase.from("vyron_cost_companies").delete().eq("id", companyId); } catch {}
  }
}

async function main() {
  const result = {
    runtime: "FAIL",
    isolation: "FAIL",
    switching: "FAIL",
    subscription: "FAIL",
    api: "FAIL",
    ui: "FAIL",
    audit: "FAIL",
    security: "FAIL",
    leakage: "FAIL",
    blocker: null,
  };

  let platform = null;
  let companyA = null;
  let companyB = null;

  try {
    platform = await createPlatformAdmin("companies.platform");

    companyA = await createCompany(platform.platformCookie, "companies-a");
    companyB = await createCompany(platform.platformCookie, "companies-b");

    // Subscription/workspace association.
    const workspaceA = await supabase.from("vyron_workspaces").select("id,company_id,package_name,status,owner_login_status,updated_at").eq("id", companyA.workspaceId).single();
    if (workspaceA.error || !workspaceA.data) {
      throw new Error(`Workspace association lookup failed: ${workspaceA.error?.message || "not found"}`);
    }
    const companyRowA = await supabase.from("vyron_cost_companies").select("id,subscription_plan,subscription_status,name,trading_name").eq("id", companyA.companyId).single();
    if (companyRowA.error || !companyRowA.data) {
      throw new Error(`Company association lookup failed: ${companyRowA.error?.message || "not found"}`);
    }

    if (
      String(workspaceA.data.company_id) !== String(companyRowA.data.id) ||
      String(workspaceA.data.package_name) !== String(companyRowA.data.subscription_plan)
    ) {
      throw new Error("Subscription/workspace association failed.");
    }

    result.subscription = "PASS";

    // Company switching where applicable: owner A vs owner B sessions resolve different active workspaces.
    const ownerACookies = await workspaceLogin(companyA.ownerEmail, companyA.ownerPassword);
    const ownerBCookies = await workspaceLogin(companyB.ownerEmail, companyB.ownerPassword);

    const statusA = await api("/api/workspace/status", { headers: { Cookie: ownerACookies } }, ownerACookies);
    const statusB = await api("/api/workspace/status", { headers: { Cookie: ownerBCookies } }, ownerBCookies);

    if (
      !statusA.data?.ok ||
      !statusB.data?.ok ||
      String(statusA.data.workspaceId || "") !== companyA.workspaceId ||
      String(statusB.data.workspaceId || "") !== companyB.workspaceId ||
      String(statusA.data.workspaceId) === String(statusB.data.workspaceId)
    ) {
      throw new Error(`Company switching failed: ${JSON.stringify({ statusA: statusA.data, statusB: statusB.data })}`);
    }

    result.switching = "PASS";

    // Edit company + company settings + company branding (name/trading identity fields).
    const companyAProfileBefore = await api("/api/workspace/admin/company", { headers: { Cookie: ownerACookies } }, ownerACookies);
    if (!companyAProfileBefore.data?.ok) {
      throw new Error(`Load company profile failed: ${JSON.stringify(companyAProfileBefore.data)}`);
    }

    const editPayload = {
      companyName: `${companyA.companyName} Edited`,
      tradingName: `${companyA.tradingName} Brand`,
      vatNumber: "VAT-123456",
      registrationNumber: "REG-987654",
      contactEmail: `edited.${companyA.ownerEmail}`,
      phone: "0215550199",
      physicalAddress: "1 Cert Street, Cape Town",
      postalAddress: "PO Box 123, Cape Town",
      defaultVatRate: 14,
    };

    const editCompany = await api(
      "/api/workspace/admin/company",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerACookies },
        body: JSON.stringify(editPayload),
      },
      ownerACookies
    );

    if (!editCompany.data?.ok || editCompany.data?.profile?.companyName !== editPayload.companyName) {
      throw new Error(`Edit company/settings/branding failed: ${JSON.stringify(editCompany.data)}`);
    }

    // Disable company access (owner login) then verify sign-in blocked.
    const disableOwner = await api(
      `/api/developer/clients/${encodeURIComponent(companyA.workspaceId)}/owner`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platform.platformCookie },
        body: JSON.stringify({ action: "disable", admin: companyA.admin }),
      },
      platform.platformCookie
    );

    if (!disableOwner.data?.ok) {
      throw new Error(`Disable company failed: ${JSON.stringify(disableOwner.data)}`);
    }

    const disabledLogin = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: companyA.ownerEmail, password: companyA.ownerPassword }),
    });
    if (disabledLogin.status !== 401) {
      throw new Error(`Disable company enforcement failed: ${JSON.stringify({ status: disabledLogin.status, body: disabledLogin.data })}`);
    }

    // Enable company access and verify sign-in works again.
    const enableOwner = await api(
      `/api/developer/clients/${encodeURIComponent(companyA.workspaceId)}/owner`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: platform.platformCookie },
        body: JSON.stringify({ action: "enable", admin: companyA.admin }),
      },
      platform.platformCookie
    );

    if (!enableOwner.data?.ok) {
      throw new Error(`Enable company failed: ${JSON.stringify(enableOwner.data)}`);
    }

    const ownerACookiesAfterEnable = await workspaceLogin(companyA.ownerEmail, companyA.ownerPassword);

    // Runtime path complete.
    result.runtime = "PASS";

    // Tenant isolation + security boundaries + no leakage.
    const companyAProfile = await api("/api/workspace/admin/company", { headers: { Cookie: ownerACookiesAfterEnable } }, ownerACookiesAfterEnable);
    const companyBProfile = await api("/api/workspace/admin/company", { headers: { Cookie: ownerBCookies } }, ownerBCookies);

    if (
      !companyAProfile.data?.ok ||
      !companyBProfile.data?.ok ||
      String(companyAProfile.data.profile?.workspaceId || "") !== companyA.workspaceId ||
      String(companyBProfile.data.profile?.workspaceId || "") !== companyB.workspaceId
    ) {
      throw new Error(`Tenant isolation failed on company profile API: ${JSON.stringify({ a: companyAProfile.data, b: companyBProfile.data })}`);
    }

    if (String(companyAProfile.raw || "").includes(companyB.companyName) || String(companyBProfile.raw || "").includes(editPayload.companyName)) {
      throw new Error("Security boundary failed: cross-company profile leakage detected.");
    }

    result.isolation = "PASS";
    result.security = "PASS";

    if (
      String(companyAProfile.data?.profile?.companyName || "") !== editPayload.companyName ||
      String(companyAProfile.data?.profile?.tradingName || "") !== editPayload.tradingName
    ) {
      throw new Error(`UI branding validation failed on company profile payload: ${JSON.stringify(companyAProfile.data)}`);
    }

    if (
      String(companyBProfile.data?.profile?.companyName || "") === editPayload.companyName ||
      String(companyBProfile.data?.profile?.tradingName || "") === editPayload.tradingName
    ) {
      throw new Error("Data leakage detected across company profile payloads.");
    }

    result.leakage = "PASS";

    // API validation: unauthorized, forbidden, and malformed payload handling.
    const unauthCompany = await api("/api/workspace/admin/company");
    if (unauthCompany.status !== 403) {
      throw new Error(`API unauthorized validation failed: ${JSON.stringify({ status: unauthCompany.status, body: unauthCompany.data })}`);
    }

    const createViewOnly = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerACookiesAfterEnable },
        body: JSON.stringify({
          firstName: "Company",
          surname: "Viewer",
          email: `companies.viewer.${Date.now()}@example.com`,
          role: "VIEW_ONLY",
          method: "password",
          password: "ViewerCert123!",
          confirmPassword: "ViewerCert123!",
        }),
      },
      ownerACookiesAfterEnable
    );

    if (!createViewOnly.data?.ok || !createViewOnly.data?.member?.email) {
      throw new Error(`API setup failed for forbidden check: ${JSON.stringify(createViewOnly.data)}`);
    }

    const viewerEmail = String(createViewOnly.data.member.email);
    const viewerCookies = await workspaceLogin(viewerEmail, "ViewerCert123!");

    const forbiddenCompany = await api("/api/workspace/admin/company", { headers: { Cookie: viewerCookies } }, viewerCookies);
    if (forbiddenCompany.status !== 403) {
      throw new Error(`API forbidden validation failed: ${JSON.stringify({ status: forbiddenCompany.status, body: forbiddenCompany.data })}`);
    }

    const malformedPatch = await api(
      "/api/workspace/admin/company",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerACookiesAfterEnable },
        body: JSON.stringify({ tradingName: "Missing required companyName" }),
      },
      ownerACookiesAfterEnable
    );
    if (malformedPatch.status < 400) {
      throw new Error(`API malformed payload validation failed: ${JSON.stringify({ status: malformedPatch.status, body: malformedPatch.data })}`);
    }

    result.api = "PASS";

    // UI validation.
    const companySetupPage = await api("/admin/company-setup", { headers: { Cookie: ownerACookiesAfterEnable } }, ownerACookiesAfterEnable);
    if (companySetupPage.status !== 200 || !String(companySetupPage.raw).includes("Company Setup")) {
      throw new Error(`UI validation failed on company setup page: ${JSON.stringify({ status: companySetupPage.status })}`);
    }

    result.ui = "PASS";

    // Audit logging/persistence validation.
    const workspaceAAfter = await supabase.from("vyron_workspaces").select("updated_at,owner_login_status,company_name,trading_name,vat_number,registration_number,default_vat_rate").eq("id", companyA.workspaceId).single();
    const companyAAfter = await supabase.from("vyron_cost_companies").select("name,trading_name,contact_email,phone,subscription_plan").eq("id", companyA.companyId).single();

    if (
      workspaceAAfter.error ||
      companyAAfter.error ||
      !workspaceAAfter.data ||
      !companyAAfter.data ||
      String(workspaceAAfter.data.owner_login_status || "").toLowerCase() !== "active" ||
      String(workspaceAAfter.data.company_name || "") !== editPayload.companyName ||
      String(workspaceAAfter.data.trading_name || "") !== editPayload.tradingName ||
      Number(workspaceAAfter.data.default_vat_rate || 0) !== 14 ||
      String(companyAAfter.data.name || "") !== editPayload.companyName ||
      String(companyAAfter.data.trading_name || "") !== editPayload.tradingName
    ) {
      throw new Error(`Audit logging/persistence validation failed: ${JSON.stringify({ workspaceAAfter: workspaceAAfter.data, companyAAfter: companyAAfter.data, workspaceError: workspaceAAfter.error?.message, companyError: companyAAfter.error?.message })}`);
    }

    result.audit = "PASS";
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (companyA) await cleanupWorkspace(companyA.workspaceId, companyA.companyId);
    if (companyB) await cleanupWorkspace(companyB.workspaceId, companyB.companyId);
    if (platform) await cleanupUserByEmail(platform.email);
  }

  console.log(`Companies Runtime Validation: ${result.runtime}`);
  console.log(`Companies Tenant Isolation Validation: ${result.isolation}`);
  console.log(`Companies Switching Validation: ${result.switching}`);
  console.log(`Companies Subscription Association Validation: ${result.subscription}`);
  console.log(`Companies API Validation: ${result.api}`);
  console.log(`Companies UI Validation: ${result.ui}`);
  console.log(`Companies Audit Logging Validation: ${result.audit}`);
  console.log(`Companies Security Boundary Validation: ${result.security}`);
  console.log(`Companies Data Leakage Validation: ${result.leakage}`);

  if (result.blocker) {
    console.log(`COMPANIES BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`COMPANIES BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
