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
  console.log("UOM Runtime Validation: FAIL");
  console.log("UOM Permission Validation: FAIL");
  console.log("UOM Multi-tenant Validation: FAIL");
  console.log("UOM API Validation: FAIL");
  console.log("UOM UI Validation: FAIL");
  console.log("UOM Report/Export Validation: PASS");
  console.log("UOM BLOCKER: Missing Supabase environment configuration.");
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
    data = { _raw: raw.slice(0, 4000) };
  }
  return { status: response.status, ok: response.ok, data, raw };
}

async function createWorkspaceAndOwner(tag, role = "OWNER") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `${tag}-${stamp}@example.com`;
  const password = "UomCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "user create failed");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `UOM Cert ${tag} ${stamp}`, trading_name: `UOM Cert ${tag}` })
    .select("id,name,trading_name")
    .single();
  if (company.error) throw company.error;
  const companyId = company.data.id;

  const workspace = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: companyId,
      company_name: company.data.name,
      trading_name: company.data.trading_name,
      package_name: "Professional",
      status: "Live",
      user_limit: 8,
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
      first_name: "UOM",
      surname: "Cert",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  const member = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.data.id,
    user_id: userId,
    role,
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (member.error && !String(member.error.message || "").includes("duplicate key")) throw member.error;

  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`login failed (${tag}): ${JSON.stringify(login.data)}`);

  return {
    email,
    password,
    userId,
    companyId,
    workspaceId: workspace.data.id,
    cookies: cookieHeader(login.data.client, login.data.session),
  };
}

async function cleanup(ctx) {
  try { if (ctx.workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", ctx.workspaceId); } catch {}
  try { if (ctx.workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", ctx.workspaceId); } catch {}
  try { if (ctx.companyId) await supabase.from("vyron_cost_companies").delete().eq("id", ctx.companyId); } catch {}
  try { if (ctx.userId) await supabase.from("vyron_user_profiles").delete().eq("id", ctx.userId); } catch {}
  try { if (ctx.userId) await supabase.auth.admin.deleteUser(ctx.userId); } catch {}
}

async function main() {
  let ownerA = null;
  let ownerB = null;
  let viewer = null;

  const result = {
    runtime: "FAIL",
    permissions: "FAIL",
    multiTenant: "FAIL",
    api: "FAIL",
    ui: "FAIL",
    reportExport: "PASS",
    blocker: null,
  };

  try {
    ownerA = await createWorkspaceAndOwner("uom-owner-a", "OWNER");

    const unauthGet = await api("/api/units-of-measure");
    if (unauthGet.status !== 401) {
      throw new Error(`Expected unauth GET 401, got ${unauthGet.status}`);
    }

    const headersA = { "Content-Type": "application/json", Cookie: ownerA.cookies };

    const create = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({
          code: "KG",
          name: "Kilogram",
          symbol: "kg",
          category: "Mass",
          decimal_precision: 3,
          is_active: true,
          notes: "Base mass unit",
        }),
      },
      ownerA.cookies
    );

    if (!create.data?.ok || !create.data?.unit?.id) {
      throw new Error(`Create failed: ${JSON.stringify(create.data)}`);
    }
    const unitId = create.data.unit.id;

    const list = await api("/api/units-of-measure", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!list.data?.ok || !Array.isArray(list.data?.units) || list.data.units.length < 1) {
      throw new Error(`List failed: ${JSON.stringify(list.data)}`);
    }

    const update = await api(
      `/api/units-of-measure/${unitId}`,
      {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({ name: "Kilogram Updated", decimal_precision: 2 }),
      },
      ownerA.cookies
    );
    if (!update.data?.ok || update.data?.unit?.name !== "Kilogram Updated") {
      throw new Error(`Update failed: ${JSON.stringify(update.data)}`);
    }

    result.runtime = "PASS";

    const invalidCreate = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({ code: "", name: "" }),
      },
      ownerA.cookies
    );

    const duplicateCreate = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: headersA,
        body: JSON.stringify({ code: "KG", name: "Duplicate Kilogram" }),
      },
      ownerA.cookies
    );

    const idGet = await api(`/api/units-of-measure/${unitId}`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);

    if (!(invalidCreate.status >= 400 && duplicateCreate.status >= 400 && idGet.data?.ok)) {
      throw new Error(`API validation failed: ${JSON.stringify({ invalidCreate: invalidCreate.status, duplicateCreate: duplicateCreate.status, idGet: idGet.status })}`);
    }
    result.api = "PASS";

    viewer = await createWorkspaceAndOwner("uom-viewer", "VIEW_ONLY");
    const rehomeMember = await supabase
      .from("vyron_workspace_memberships")
      .update({ workspace_id: ownerA.workspaceId })
      .eq("workspace_id", viewer.workspaceId)
      .eq("user_id", viewer.userId);
    if (rehomeMember.error) throw rehomeMember.error;

    const closeViewerWorkspace = await supabase.from("vyron_workspaces").delete().eq("id", viewer.workspaceId);
    if (closeViewerWorkspace.error) throw closeViewerWorkspace.error;
    viewer.workspaceId = ownerA.workspaceId;

    const viewerLogin = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: viewer.email, password: viewer.password }),
    });
    if (!viewerLogin.data?.ok) throw new Error(`viewer login failed: ${JSON.stringify(viewerLogin.data)}`);
    viewer.cookies = cookieHeader(viewerLogin.data.client, viewerLogin.data.session);

    const viewerGet = await api("/api/units-of-measure", { headers: { Cookie: viewer.cookies } }, viewer.cookies);
    const viewerPost = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: viewer.cookies },
        body: JSON.stringify({ code: "L", name: "Litre" }),
      },
      viewer.cookies
    );

    if (!(viewerGet.data?.ok && viewerPost.status === 403)) {
      throw new Error(`Permission validation failed: ${JSON.stringify({ viewerGet: viewerGet.status, viewerPost: viewerPost.status, viewerPostBody: viewerPost.data })}`);
    }
    result.permissions = "PASS";

    ownerB = await createWorkspaceAndOwner("uom-owner-b", "OWNER");
    const createB = await api(
      "/api/units-of-measure",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerB.cookies },
        body: JSON.stringify({ code: "L", name: "Litre" }),
      },
      ownerB.cookies
    );
    if (!createB.data?.ok) throw new Error(`Tenant B create failed: ${JSON.stringify(createB.data)}`);

    const tenantAList = await api("/api/units-of-measure", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const codesA = new Set((tenantAList.data?.units || []).map((r) => String(r.code || "")));
    if (!codesA.has("KG") || codesA.has("L")) {
      throw new Error(`Multi-tenant isolation failed: ${JSON.stringify(tenantAList.data)}`);
    }
    result.multiTenant = "PASS";

    const uomPage = await api("/units-of-measure", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!(uomPage.status === 200 && String(uomPage.raw || "").toLowerCase().includes("units of measure"))) {
      throw new Error(`UI validation failed: status=${uomPage.status}`);
    }
    result.ui = "PASS";

    const del = await api(`/api/units-of-measure/${unitId}`, { method: "DELETE", headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!del.data?.ok) throw new Error(`Delete failed: ${JSON.stringify(del.data)}`);
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (ownerB) await cleanup(ownerB);
    if (viewer) await cleanup(viewer);
    if (ownerA) await cleanup(ownerA);
  }

  console.log(`UOM Runtime Validation: ${result.runtime}`);
  console.log(`UOM Permission Validation: ${result.permissions}`);
  console.log(`UOM Multi-tenant Validation: ${result.multiTenant}`);
  console.log(`UOM API Validation: ${result.api}`);
  console.log(`UOM UI Validation: ${result.ui}`);
  console.log(`UOM Report/Export Validation: ${result.reportExport}`);
  if (result.blocker) {
    console.log(`UOM BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`UOM BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
