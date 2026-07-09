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
  console.log("PDF Runtime Validation: FAIL");
  console.log("PDF Permission Validation: FAIL");
  console.log("PDF Multi-tenant Validation: FAIL");
  console.log("PDF API Validation: FAIL");
  console.log("PDF UI Validation: FAIL");
  console.log("PDF Content Validation: FAIL");
  console.log("PDF Report/Export Validation: FAIL");
  console.log("PDF BLOCKER: Missing Supabase environment configuration.");
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
    data = { _raw: raw.slice(0, 8000) };
  }
  return { status: response.status, ok: response.ok, data, raw };
}

async function createWorkspaceAndUser(tag, role = "OWNER") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `${tag}-${stamp}@example.com`;
  const password = "PdfCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "user create failed");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `PDF Cert ${tag} ${stamp}`, trading_name: `PDF Cert ${tag}` })
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
      first_name: "PDF",
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
    companyId: company.data.id,
    workspaceId: workspace.data.id,
    cookies: cookieHeader(login.data.client, login.data.session),
    seededStockItemIds: [],
  };
}

async function seedStockItem(companyId, code, description) {
  const insert = await supabase
    .from("vyron_cost_stock_items")
    .insert({
      company_id: companyId,
      item_code: code,
      description,
      category: "Certification",
      entity_type: "ingredient",
      entity_id: null,
      unit: "kg",
      qty_on_hand: 25,
      current_cost: 10.5,
      average_cost: 10.5,
      reorder_level: 5,
      min_level: 2,
      max_level: 200,
      stock_status: "In Stock",
    })
    .select("id")
    .single();

  if (insert.error) throw insert.error;
  return insert.data.id;
}

async function cleanup(ctx) {
  if (!ctx) return;

  for (const stockItemId of ctx.seededStockItemIds || []) {
    try { await supabase.from("vyron_cost_stock_items").delete().eq("id", stockItemId); } catch {}
  }

  try { if (ctx.workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", ctx.workspaceId); } catch {}
  try { if (ctx.workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", ctx.workspaceId); } catch {}
  try { if (ctx.companyId) await supabase.from("vyron_cost_companies").delete().eq("id", ctx.companyId); } catch {}
  try { if (ctx.userId) await supabase.from("vyron_user_profiles").delete().eq("id", ctx.userId); } catch {}
  try { if (ctx.userId) await supabase.auth.admin.deleteUser(ctx.userId); } catch {}
}

function assertExportPayload(payload) {
  if (!payload || !payload.title || !payload.branding?.companyName) {
    throw new Error("Export payload missing title or branding.");
  }
  if (!Array.isArray(payload.columns) || payload.columns.length === 0) {
    throw new Error("Export payload has no columns.");
  }
  if (!Array.isArray(payload.rows)) {
    throw new Error("Export payload rows not present.");
  }
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
    pdfContent: "FAIL",
    reportExport: "FAIL",
    blocker: null,
  };

  try {
    ownerA = await createWorkspaceAndUser("pdf-owner-a", "OWNER");
    const stockAId = await seedStockItem(ownerA.companyId, "PDF-A-ONLY", "PDF_CERT_TENANT_A_ONLY");
    ownerA.seededStockItemIds.push(stockAId);

    const unauth = await api("/api/reports/exports/inventory-stock");
    if (unauth.status !== 401) throw new Error(`Expected unauth export 401, got ${unauth.status}`);

    const inventoryExport = await api("/api/reports/exports/inventory-stock", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const manufacturingExport = await api("/api/reports/exports/manufacturing", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const salesExport = await api("/api/reports/exports/sales", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);

    if (!inventoryExport.data?.ok || !manufacturingExport.data?.ok || !salesExport.data?.ok) {
      throw new Error(
        `Owner export endpoint failure: ${JSON.stringify({
          inventory: { status: inventoryExport.status, body: inventoryExport.data },
          manufacturing: { status: manufacturingExport.status, body: manufacturingExport.data },
          sales: { status: salesExport.status, body: salesExport.data },
        })}`
      );
    }

    assertExportPayload(inventoryExport.data.export);
    assertExportPayload(manufacturingExport.data.export);
    assertExportPayload(salesExport.data.export);

    result.runtime = "PASS";

    const unknownExport = await api("/api/reports/exports/does-not-exist", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const dateFilteredExport = await api("/api/reports/exports/inventory-stock?from=2026-01-01&to=2026-12-31", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);

    if (unknownExport.status !== 404 || !dateFilteredExport.data?.ok) {
      throw new Error(`API validation failed: ${JSON.stringify({ unknown: unknownExport.status, filtered: dateFilteredExport.status })}`);
    }

    result.api = "PASS";

    viewer = await createWorkspaceAndUser("pdf-viewer", "VIEW_ONLY");

    const rehomeViewer = await supabase
      .from("vyron_workspace_memberships")
      .update({ workspace_id: ownerA.workspaceId })
      .eq("workspace_id", viewer.workspaceId)
      .eq("user_id", viewer.userId);
    if (rehomeViewer.error) throw rehomeViewer.error;

    const dropViewerWorkspace = await supabase.from("vyron_workspaces").delete().eq("id", viewer.workspaceId);
    if (dropViewerWorkspace.error) throw dropViewerWorkspace.error;
    viewer.workspaceId = ownerA.workspaceId;

    const viewerLogin = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: viewer.email, password: viewer.password }),
    });
    if (!viewerLogin.data?.ok) throw new Error(`viewer login failed: ${JSON.stringify(viewerLogin.data)}`);
    viewer.cookies = cookieHeader(viewerLogin.data.client, viewerLogin.data.session);

    const viewerExport = await api("/api/reports/exports/inventory-stock", { headers: { Cookie: viewer.cookies } }, viewer.cookies);
    if (viewerExport.status !== 403) throw new Error(`Expected viewer export 403, got ${viewerExport.status}`);

    result.permissions = "PASS";

    ownerB = await createWorkspaceAndUser("pdf-owner-b", "OWNER");
    const stockBId = await seedStockItem(ownerB.companyId, "PDF-B-ONLY", "PDF_CERT_TENANT_B_ONLY");
    ownerB.seededStockItemIds.push(stockBId);

    const tenantAExport = await api("/api/reports/exports/inventory-stock", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const tenantBExport = await api("/api/reports/exports/inventory-stock", { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);

    const rowsA = (tenantAExport.data?.export?.rows || []).flat().map((v) => String(v));
    const rowsB = (tenantBExport.data?.export?.rows || []).flat().map((v) => String(v));

    if (!rowsA.some((v) => v.includes("PDF_CERT_TENANT_A_ONLY"))) throw new Error("Tenant A export missing tenant A data.");
    if (rowsA.some((v) => v.includes("PDF_CERT_TENANT_B_ONLY"))) throw new Error("Tenant A export leaked tenant B data.");
    if (!rowsB.some((v) => v.includes("PDF_CERT_TENANT_B_ONLY"))) throw new Error("Tenant B export missing tenant B data.");

    result.multiTenant = "PASS";

    const inventoryPage = await api("/reports/inventory-stock", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const manufacturingPage = await api("/reports/manufacturing", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const salesPage = await api("/reports/sales", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);

    for (const page of [inventoryPage, manufacturingPage, salesPage]) {
      if (page.status !== 200) throw new Error(`UI page status check failed: ${page.status}`);
      const html = String(page.raw || "");
      if (html.includes("PDF coming soon")) throw new Error("UI still contains PDF placeholder text.");
      if (!html.includes("Export PDF")) throw new Error("UI missing Export PDF action.");
    }

    result.ui = "PASS";

    const pdfPayload = inventoryExport.data?.export;
    if (!pdfPayload?.fileName?.toLowerCase().endsWith(".pdf")) {
      throw new Error("PDF export file naming invalid.");
    }
    if (!Array.isArray(pdfPayload.summary) || pdfPayload.summary.length === 0) {
      throw new Error("PDF summary section missing.");
    }
    if (!Array.isArray(pdfPayload.rows) || pdfPayload.rows.length === 0) {
      throw new Error("PDF report payload has no row content.");
    }

    result.pdfContent = "PASS";
    result.reportExport = "PASS";
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (ownerB) await cleanup(ownerB);
    if (viewer) await cleanup(viewer);
    if (ownerA) await cleanup(ownerA);
  }

  console.log(`PDF Runtime Validation: ${result.runtime}`);
  console.log(`PDF Permission Validation: ${result.permissions}`);
  console.log(`PDF Multi-tenant Validation: ${result.multiTenant}`);
  console.log(`PDF API Validation: ${result.api}`);
  console.log(`PDF UI Validation: ${result.ui}`);
  console.log(`PDF Content Validation: ${result.pdfContent}`);
  console.log(`PDF Report/Export Validation: ${result.reportExport}`);

  if (result.blocker) {
    console.log(`PDF BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`PDF BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
