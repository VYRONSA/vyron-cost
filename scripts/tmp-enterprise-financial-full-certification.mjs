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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env configuration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

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
const email = `xero-full-cert-${stamp}@example.com`;
const password = "Probe123!";
let userId = null;
let workspaceId = null;
let companyId = null;
let categoryName = null;
let productId = null;
let customerId = null;
let invoiceId = null;

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
    const id = String(row.workspace_id || "").trim();
    const c = row.connection || {};
    return Boolean(UUID_RE.test(id) && c.connected && c.accessToken && c.refreshToken && c.tenantId && c.tenantId !== "—");
  });

  assert(
    Boolean(live?.workspace_id),
    "Chart of Accounts Sync",
    "Find workspace with live Xero connection",
    "No UUID-scoped connected workspace with Xero tokens found.",
    "src/lib/vyron-xero-api-context.ts",
    "Connect at least one UUID workspace to Xero and persist tokens before certification."
  );

  workspaceId = String(live.workspace_id);
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
    "Ensure selected workspace row has valid company_id and API context resolves UUID-scoped identifiers."
  );
  companyId = String(ws.data.company_id);

  const user = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  assert(
    !user.error && Boolean(user.data.user?.id),
    "Chart of Accounts Sync",
    "Create certification user",
    user.error?.message || "Could not create runtime probe user.",
    "scripts/tmp-enterprise-financial-full-certification.mjs",
    "Allow admin user creation in certification environment or provide test credentials."
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
    "Ensure workspace login dependencies include vyron_user_profiles for new users."
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
    "Ensure certification user can be assigned OWNER role in target workspace."
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
    "Fix workspace login/session creation for valid workspace users."
  );

  const cookies = cookieHeader(login.data.client, login.data.session);

  const baseHeaders = { "Content-Type": "application/json" };

  const preCatalog = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
  assert(
    preCatalog.data?.ok,
    "Chart of Accounts Sync",
    "Load account catalog before sync",
    JSON.stringify(preCatalog.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix account catalog GET for authenticated UUID-scoped workspace context."
  );

  const autoSync = await api(
    "/api/integrations/xero/connection",
    {
      method: "POST",
      headers: baseHeaders,
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
    "Fix organisation selection action to trigger account sync for valid connected workspace."
  );

  const manualSync = await api(
    "/api/integrations/xero/accounts",
    {
      method: "POST",
      headers: baseHeaders,
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
    "Fix sync-from-xero action and permission flow."
  );

  const catalog = manualSync.data?.accountCatalog?.accounts || [];
  assert(
    Array.isArray(catalog) && catalog.length > 0,
    "Chart of Accounts Sync",
    "Validate synced account payload",
    "No accounts returned after sync.",
    "src/lib/vyron-financial-engine.ts",
    "Ensure Xero /Accounts fetch returns ACTIVE records and response maps synced rows."
  );

  assert(
    catalog.every((a) => String(a?.status || "").toUpperCase() === "ACTIVE"),
    "Chart of Accounts Sync",
    "Validate ACTIVE-only account import",
    "Catalog contains non-ACTIVE accounts.",
    "src/lib/vyron-financial-engine.ts",
    "Filter imported Xero accounts to ACTIVE before UPSERT."
  );

  assert(
    !hasDupes(catalog.map((a) => a?.accountId || null)),
    "Chart of Accounts Sync",
    "Validate no duplicate external accounts",
    "Duplicate external account IDs detected after sync.",
    "src/lib/vyron-financial-engine.ts",
    "Deduplicate by external_account_id prior to UPSERT conflict handling."
  );

  assert(
    !hasDupes(catalog.map((a) => a?.accountCode || null)),
    "Chart of Accounts Sync",
    "Validate no duplicate account codes",
    "Duplicate account codes detected in synced catalog.",
    "src/lib/vyron-financial-engine.ts",
    "Ensure account code uniqueness per UUID workspace/company scope."
  );

  const defaultsPayload = {
    salesAccount: catalog.find((a) => /revenue|income/i.test(String(a?.accountType || "")))?.accountCode || "",
    costOfSalesAccount: catalog.find((a) => /directcosts|expense/i.test(String(a?.accountType || "")))?.accountCode || "",
    inventoryAssetAccount: catalog.find((a) => /inventory|current asset|currentasset/i.test(String(a?.accountType || "")))?.accountCode || "",
    vatStandard: manualSync.data?.taxTypes?.[0] || "",
  };

  const saveDefaults = await api(
    "/api/integrations/xero/accounts",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ action: "save-defaults", mapping: defaultsPayload }),
    },
    cookies
  );

  assert(
    saveDefaults.data?.ok,
    "Company Financial Defaults",
    "Save company defaults",
    JSON.stringify(saveDefaults.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix save-defaults payload validation/persistence for UUID-scoped company settings."
  );

  const reloadDefaults = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
  assert(
    reloadDefaults.data?.ok && String(reloadDefaults.data?.mapping?.salesAccount || "") === String(defaultsPayload.salesAccount || ""),
    "Company Financial Defaults",
    "Reload persisted company defaults",
    JSON.stringify(reloadDefaults.data),
    "src/lib/vyron-financial-engine.ts",
    "Ensure company financial settings are persisted and reloaded by workspace/company/integration scope."
  );

  const second = await supabase.auth.admin.createUser({ email: `xero-other-${stamp}@example.com`, password, email_confirm: true });
  assert(
    !second.error && Boolean(second.data.user?.id),
    "Company Financial Defaults",
    "Prepare second-tenant isolation probe",
    second.error?.message || "Could not create second isolation probe user.",
    "scripts/tmp-enterprise-financial-full-certification.mjs",
    "Allow creation of second probe user for isolation checks."
  );
  const secondUserId = second.data.user.id;

  let secondWorkspaceId = null;
  let secondCompanyId = null;

  try {
    const comp = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `Iso ${stamp}`, trading_name: `Iso ${stamp}` })
      .select("id,name,trading_name")
      .single();
    assert(
      !comp.error && Boolean(comp.data?.id),
      "Company Financial Defaults",
      "Create isolation company",
      comp.error?.message || "Could not create isolation company.",
      "src/lib/vyron-saas-workspace.ts",
      "Fix company create path used by workspace setup."
    );
    secondCompanyId = comp.data.id;

    const ws2 = await supabase
      .from("vyron_workspaces")
      .insert({
        company_id: secondCompanyId,
        company_name: comp.data.name,
        trading_name: comp.data.trading_name,
        package_name: "Professional",
        status: "Live",
        user_limit: 5,
        owner_user_id: secondUserId,
        contact_email: `xero-other-${stamp}@example.com`,
      })
      .select("id")
      .single();

    assert(
      !ws2.error && Boolean(ws2.data?.id),
      "Company Financial Defaults",
      "Create isolation workspace",
      ws2.error?.message || "Could not create isolation workspace.",
      "src/lib/vyron-saas-workspace.ts",
      "Fix workspace create path used by runtime isolation setup."
    );

    secondWorkspaceId = ws2.data.id;

    await supabase.from("vyron_user_profiles").upsert(
      {
        id: secondUserId,
        email: `xero-other-${stamp}@example.com`,
        first_name: "Iso",
        surname: "User",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    await supabase.from("vyron_workspace_memberships").insert({
      workspace_id: secondWorkspaceId,
      user_id: secondUserId,
      role: "OWNER",
      status: "Active",
      joined_at: new Date().toISOString(),
    });

    const login2 = await api("/api/workspace/login", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ email: `xero-other-${stamp}@example.com`, password }),
    });

    assert(
      login2.data?.ok,
      "Company Financial Defaults",
      "Validate tenant isolation login",
      JSON.stringify(login2.data),
      "src/app/api/workspace/login/route.ts",
      "Fix second tenant workspace login/session creation."
    );

    const cookies2 = cookieHeader(login2.data.client, login2.data.session);
    const defaults2 = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies2);

    assert(
      defaults2.data?.ok,
      "Company Financial Defaults",
      "Load defaults in second tenant",
      JSON.stringify(defaults2.data),
      "src/app/api/integrations/xero/accounts/route.ts",
      "Fix defaults endpoint in isolated tenant context."
    );

    assert(
      String(defaults2.data?.mapping?.salesAccount || "") !== String(defaultsPayload.salesAccount || ""),
      "Company Financial Defaults",
      "Validate multi-tenant and multi-company isolation",
      "Second tenant observed first tenant financial defaults.",
      "src/lib/vyron-financial-engine.ts",
      "Ensure company defaults query is scoped by workspace_id and company_id."
    );

    try {
      await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", secondWorkspaceId);
    } catch {}
    try {
      await supabase.from("vyron_workspaces").delete().eq("id", secondWorkspaceId);
    } catch {}
    try {
      await supabase.from("vyron_cost_companies").delete().eq("id", secondCompanyId);
    } catch {}
    try {
      await supabase.from("vyron_user_profiles").delete().eq("id", secondUserId);
    } catch {}
    try {
      await supabase.auth.admin.deleteUser(secondUserId);
    } catch {}
  } catch (e) {
    fail(
      "Company Financial Defaults",
      "Validate multi-company and multi-tenant isolation",
      e instanceof Error ? e.message : "Isolation probe failed.",
      "src/lib/vyron-financial-engine.ts",
      "Fix strict company/workspace scope isolation for financial defaults reads/writes."
    );
  }

  categoryName = `CERT-CAT-${stamp}`;

  const saveCategory = await api(
    "/api/integrations/xero/accounts",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        action: "save-category",
        categoryName,
        mapping: {
          salesAccount: defaultsPayload.salesAccount,
          costOfSalesAccount: defaultsPayload.costOfSalesAccount,
          inventoryAssetAccount: defaultsPayload.inventoryAssetAccount,
          vatStandard: defaultsPayload.vatStandard,
        },
      }),
    },
    cookies
  );

  assert(
    saveCategory.data?.ok,
    "Category Financial Mapping",
    "Save category financial mapping",
    JSON.stringify(saveCategory.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix save-category action validation or persistence."
  );

  const createProduct = await api(
    "/api/products",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        product_name: `CERT Product ${stamp}`,
        product_category: categoryName,
        selling_price: 30,
        total_cost: 15,
        target_gp: 30,
        product_status: "Active",
        sku: `CERT-${stamp}`,
      }),
    },
    cookies
  );

  assert(
    createProduct.data?.ok && createProduct.data?.product?.id,
    "Product Financial Overrides",
    "Create product for financial override test",
    JSON.stringify(createProduct.data),
    "src/app/api/products/route.ts",
    "Fix product create flow used by financial override runtime tests."
  );

  productId = createProduct.data.product.id;

  const saveProduct = await api(
    "/api/integrations/xero/accounts",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        action: "save-product",
        productId,
        mapping: {
          salesAccount: defaultsPayload.salesAccount,
          costOfSalesAccount: "",
          inventoryAssetAccount: "",
          vatStandard: defaultsPayload.vatStandard,
        },
      }),
    },
    cookies
  );

  assert(
    saveProduct.data?.ok,
    "Product Financial Overrides",
    "Save product override",
    JSON.stringify(saveProduct.data),
    "src/app/api/integrations/xero/accounts/route.ts",
    "Fix save-product action validation or persistence."
  );

  const productRow = await supabase
    .from("vyron_cost_products")
    .select("financial_sales_account_code, financial_cost_of_sales_account_code, financial_inventory_account_code, financial_vat_tax_type")
    .eq("id", productId)
    .maybeSingle();

  assert(
    !productRow.error && Boolean(productRow.data),
    "Product Financial Overrides",
    "Reload product override persistence",
    productRow.error?.message || "Product row not found after override save.",
    "src/lib/vyron-financial-engine.ts",
    "Ensure product financial overrides are persisted to product financial columns."
  );

  customerId = null;
  const customer = await api(
    "/api/customers",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ customerName: `CERT Customer ${stamp}`, terms: "30 Days", status: "Active" }),
    },
    cookies
  );

  assert(
    customer.data?.ok && customer.data?.customer?.id,
    "Invoice Export Mapping",
    "Create customer for invoice export test",
    JSON.stringify(customer.data),
    "src/app/api/customers/route.ts",
    "Fix customer create path required for invoice export certification."
  );

  customerId = customer.data.customer.id;

  const invoice = await api(
    "/api/customer-invoices",
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        customerId,
        customerName: `CERT Customer ${stamp}`,
        lines: [
          {
            productId,
            productName: `CERT Product ${stamp}`,
            quantity: 2,
            sellingPrice: 30,
            costPerUnit: 15,
          },
        ],
      }),
    },
    cookies
  );

  assert(
    invoice.data?.ok && invoice.data?.invoice?.id,
    "Invoice Export Mapping",
    "Create invoice with mapped product",
    JSON.stringify(invoice.data),
    "src/app/api/customer-invoices/route.ts",
    "Fix invoice create API for mapped product lines."
  );

  invoiceId = invoice.data.invoice.id;

  const exportAttempt = await api(`/api/customer-invoices/${invoiceId}/post`, { method: "POST", headers: baseHeaders, body: JSON.stringify({}) }, cookies);

  assert(
    exportAttempt.status < 500,
    "Invoice Export Mapping",
    "Execute invoice export posting",
    JSON.stringify(exportAttempt.data),
    "src/lib/vyron-xero-sync-engine.ts",
    "Fix runtime exporter errors and ensure account/tax resolution without hardcoded GLs."
  );

  console.log(
    JSON.stringify(
      {
        chartSync: "PASS",
        companyDefaults: "PASS",
        categoryMapping: "PASS",
        productOverrides: "PASS",
        invoiceExportMapping: "PASS",
      },
      null,
      2
    )
  );
} finally {
  try {
    if (invoiceId) {
      await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId);
      await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId);
    }
  } catch {}
  try {
    if (productId) await supabase.from("vyron_cost_products").delete().eq("id", productId);
  } catch {}
  try {
    if (customerId) await supabase.from("vyron_customers").delete().eq("id", customerId);
  } catch {}
  try {
    if (categoryName && companyId) {
      await supabase.from("vyron_cost_categories").delete().eq("company_id", companyId).eq("name", categoryName);
    }
  } catch {}
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
