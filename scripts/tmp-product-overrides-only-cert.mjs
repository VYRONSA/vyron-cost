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

function fail(runtimeStep, rootCause, exactFile, smallestFix) {
  console.log(
    JSON.stringify(
      {
        module: "Product Financial Overrides",
        runtimeStep,
        rootCause,
        exactFile,
        smallestFix,
      },
      null,
      2
    )
  );
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

function chooseDistinct(accounts, roleRegex, exclude = new Set()) {
  for (const account of accounts) {
    const t = String(account.accountType || "").toLowerCase();
    const c = String(account.accountCode || "").trim();
    if (!c || exclude.has(c)) continue;
    if (roleRegex.test(t)) return c;
  }
  return "";
}

async function ensureCategory(companyId, categoryName) {
  const existing = await supabase
    .from("vyron_cost_categories")
    .select("id")
    .eq("company_id", companyId)
    .ilike("category_name", categoryName)
    .maybeSingle();
  if (existing.data?.id) return;

  const insert = await supabase.from("vyron_cost_categories").insert({
    company_id: companyId,
    category_name: categoryName,
    category_type: "Product",
    description: "Runtime certification category",
    status: "Active",
  });

  if (insert.error) fail("Create certification category", insert.error.message, "src/lib/vyron-cost-master-data.ts", "Allow category row creation with required fields for product mapping runtime flow.");
}

async function syncInvoiceAndReadAccountCode(cookies, invoiceId, workspaceId, companyId) {
  const queued = await api(
    "/api/integrations/xero/sync-queue",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "queue-invoice", invoiceId }),
    },
    cookies
  );

  if (!queued.data?.ok || !queued.data?.item?.id) {
    fail("Queue invoice for export mapping check", JSON.stringify(queued.data), "src/app/api/integrations/xero/sync-queue/route.ts", "Fix queue-invoice action to queue valid customer invoice items.");
  }

  const synced = await api(
    "/api/integrations/xero/sync-queue",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id: queued.data.item.id }),
    },
    cookies
  );

  if (!synced.data?.ok || !synced.data?.item?.xeroId) {
    fail("Sync queued invoice to Xero", JSON.stringify(synced.data), "src/lib/vyron-xero-sync-engine.ts", "Fix invoice sync processing so queued invoices export successfully.");
  }

  const xeroId = String(synced.data.item.xeroId);

  const conn = await supabase
    .from("vyron_xero_workspace_settings")
    .select("connection")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const connection = conn.data?.connection || {};
  const token = String(connection.accessToken || "").trim();
  const tenantId = String(connection.tenantId || "").trim();
  if (!token || !tenantId || tenantId === "—") {
    fail("Read Xero connection after sync", "Missing access token or tenant id in workspace connection store.", "src/lib/vyron-xero-connection-store.ts", "Persist refreshed Xero tokens and tenant id before invoice sync completion.");
  }

  const xr = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${xeroId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });

  const txt = await xr.text();
  let payload;
  try {
    payload = txt ? JSON.parse(txt) : {};
  } catch {
    payload = { raw: txt };
  }

  if (!xr.ok) {
    fail("Fetch exported Xero invoice", `HTTP ${xr.status}: ${txt.slice(0, 300)}`, "src/lib/vyron-xero-client.ts", "Ensure valid token refresh and Xero invoice fetch for exported invoice verification.");
  }

  const line = payload?.Invoices?.[0]?.LineItems?.[0];
  const accountCode = String(line?.AccountCode || "").trim();
  const taxType = String(line?.TaxType || "").trim();
  if (!accountCode) {
    fail("Read AccountCode from exported line", JSON.stringify(payload?.Invoices?.[0] || {}), "src/lib/vyron-xero-sync-engine.ts", "Ensure exported invoice line includes resolved AccountCode from mapping hierarchy.");
  }
  return { accountCode, taxType };
}

const stamp = Date.now();
const email = `product-ovr-cert-${stamp}@example.com`;
const password = "Probe123!";
let userId = null;
let workspaceId = null;
let companyId = null;
let productId = null;
let customerId = null;
const invoiceIds = [];
let categoryName = null;
let secondUserId = null;
let secondWorkspaceId = null;
let secondCompanyId = null;

try {
  const rows = await supabase
    .from("vyron_xero_workspace_settings")
    .select("workspace_id, connection")
    .limit(100);
  if (rows.error) fail("Load connected Xero workspaces", rows.error.message, "src/lib/vyron-xero-connection-store.ts", "Ensure Xero workspace settings are readable for runtime verification.");

  const live = (rows.data || []).find((row) => {
    const id = String(row.workspace_id || "").trim();
    const c = row.connection || {};
    return UUID_RE.test(id) && c.connected && c.accessToken && c.refreshToken && c.tenantId && c.tenantId !== "—";
  });

  if (!live?.workspace_id) {
    fail("Select runtime workspace", "No UUID-scoped connected Xero workspace available.", "src/lib/vyron-xero-api-context.ts", "Connect a UUID-scoped workspace to Xero before running Product Financial Overrides certification.");
  }

  workspaceId = String(live.workspace_id);

  const ws = await supabase.from("vyron_workspaces").select("company_id").eq("id", workspaceId).maybeSingle();
  if (ws.error || !ws.data?.company_id) {
    fail("Resolve workspace company", ws.error?.message || "company_id missing for selected workspace.", "src/lib/vyron-workspace-company-resolution.ts", "Ensure workspace has a valid company_id UUID before Product Overrides verification.");
  }
  companyId = String(ws.data.company_id);

  const u = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error || !u.data.user?.id) fail("Create certification user", u.error?.message || "create user failed", "scripts/tmp-product-overrides-only-cert.mjs", "Allow runtime probe user creation in certification environment.");
  userId = u.data.user.id;

  await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "Product", surname: "Cert", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const m = await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });
  if (m.error) fail("Grant workspace membership", m.error.message, "src/lib/vyron-workspace-access.ts", "Ensure probe user can be granted OWNER in target workspace.");

  const login = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!login.data?.ok || !login.data?.client || !login.data?.session) {
    fail("Authenticate workspace user", JSON.stringify(login.data), "src/app/api/workspace/login/route.ts", "Fix login/session bootstrap for workspace users.");
  }
  const cookies = cookieHeader(login.data.client, login.data.session);

  const listProducts = await api("/api/products", { method: "GET" }, cookies);
  if (!listProducts.data?.ok) {
    fail("Load Product Financial Override section data", JSON.stringify(listProducts.data), "src/app/api/products/route.ts", "Fix products GET for authenticated workspace context.");
  }

  const accounts = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
  if (!accounts.data?.ok) {
    fail("Load financial account catalog", JSON.stringify(accounts.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix account catalog endpoint for Product Overrides dependencies.");
  }

  const catalog = Array.isArray(accounts.data?.accountCatalog?.accounts) ? accounts.data.accountCatalog.accounts : [];
  if (!catalog.length) {
    fail("Load account options", "No synced account catalog returned.", "src/lib/vyron-financial-engine.ts", "Sync chart of accounts before Product Overrides verification.");
  }

  const used = new Set();
  const defaultSales = chooseDistinct(catalog, /revenue|income|otherincome/, used);
  used.add(defaultSales);
  const categorySales = chooseDistinct(catalog, /revenue|income|otherincome/, used) || defaultSales;
  used.add(categorySales);
  const productSales = chooseDistinct(catalog, /revenue|income|otherincome/, used) || categorySales;
  const defaultVat = String(accounts.data?.taxTypes?.[0] || "");

  if (!defaultSales) fail("Resolve default sales account", "No revenue/income account available in catalog.", "src/lib/vyron-xero-integration.ts", "Ensure catalog has at least one revenue/income account for sales mappings.");

  const saveDefaults = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-defaults", mapping: { salesAccount: defaultSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: defaultVat } }) },
    cookies
  );
  if (!saveDefaults.data?.ok) {
    fail("Save company defaults prerequisite", JSON.stringify(saveDefaults.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-defaults for product override dependency setup.");
  }

  categoryName = `POVR-CAT-${stamp}`;
  await ensureCategory(companyId, categoryName);

  const saveCategory = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: categorySales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: defaultVat } }) },
    cookies
  );
  if (!saveCategory.data?.ok) {
    fail("Save category financial mapping", JSON.stringify(saveCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-category action for Product Overrides inheritance path.");
  }

  const createProduct = await api(
    "/api/products",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: `POVR Product ${stamp}`, product_category: categoryName, selling_price: 30, total_cost: 15, target_gp: 30, product_status: "Active" }),
    },
    cookies
  );
  if (!createProduct.data?.ok || !createProduct.data?.product?.id) {
    fail("Create product for overrides", JSON.stringify(createProduct.data), "src/app/api/products/route.ts", "Fix product create flow used by Product Overrides runtime certification.");
  }
  productId = String(createProduct.data.product.id);

  const loadProductInitial = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  if (!loadProductInitial.data?.ok || !loadProductInitial.data?.product) {
    fail("Load existing product override values", JSON.stringify(loadProductInitial.data), "src/app/api/products/[id]/route.ts", "Fix product detail route to return product financial fields.");
  }

  if (!("financial_sales_account_id" in loadProductInitial.data.product)) {
    fail("Load financial override fields", "Product payload missing financial_sales_account_id field.", "src/app/api/products/[id]/route.ts", "Return product financial override fields in product detail response.");
  }

  const saveProductOverride = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: defaultVat } }) },
    cookies
  );
  if (!saveProductOverride.data?.ok) {
    fail("Save product financial override", JSON.stringify(saveProductOverride.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-product action for valid product override payloads.");
  }

  const loadProductAfterSave = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  const currentSalesRef = String(loadProductAfterSave.data?.product?.financial_sales_account_id || "").trim();
  if (!loadProductAfterSave.data?.ok || !currentSalesRef) {
    fail("Reload saved product override values", JSON.stringify(loadProductAfterSave.data), "src/lib/vyron-financial-engine.ts", "Persist product override fields on vyron_cost_products and return them on reload.");
  }

  const clearProductOverride = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
    cookies
  );
  if (!clearProductOverride.data?.ok) {
    fail("Clear product overrides to test inheritance", JSON.stringify(clearProductOverride.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow blank product overrides for inheritance semantics.");
  }

  const loadAfterClear = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  if (String(loadAfterClear.data?.product?.financial_sales_account_id || "").trim()) {
    fail("Verify blank override inheritance state", "Product sales override did not clear to null/blank.", "src/lib/vyron-financial-engine.ts", "Persist blank product overrides as null so category/company inheritance can apply.");
  }

  const saveProductPrecedence = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: defaultVat } }) },
    cookies
  );
  if (!saveProductPrecedence.data?.ok) {
    fail("Set product override for precedence check", JSON.stringify(saveProductPrecedence.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-product before precedence verification.");
  }

  const customer = await api(
    "/api/customers",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: `POVR Customer ${stamp}`, terms: "30 Days", status: "Active" }) },
    cookies
  );
  if (!customer.data?.ok || !customer.data?.customer?.id) {
    fail("Create customer for precedence verification", JSON.stringify(customer.data), "src/app/api/customers/route.ts", "Fix customer creation required by invoice export checks.");
  }
  customerId = String(customer.data.customer.id);

  async function createInvoiceAndResolveAccount() {
    const invoice = await api(
      "/api/customer-invoices",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, customerName: `POVR Customer ${stamp}`, lines: [{ productId, productName: `POVR Product ${stamp}`, quantity: 1, sellingPrice: 30, costPerUnit: 15 }] }),
      },
      cookies
    );
    if (!invoice.data?.ok || !invoice.data?.invoice?.id) {
      fail("Create invoice for mapping precedence", JSON.stringify(invoice.data), "src/app/api/customer-invoices/route.ts", "Fix invoice creation for Product Overrides precedence verification.");
    }
    const id = String(invoice.data.invoice.id);
    invoiceIds.push(id);
    return syncInvoiceAndReadAccountCode(cookies, id, workspaceId, companyId);
  }

  const stepProductWins = await createInvoiceAndResolveAccount();
  if (stepProductWins.accountCode !== productSales) {
    fail("Verify product override precedence", `Expected AccountCode ${productSales}, got ${stepProductWins.accountCode}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolveAccountCodeForProductLine prioritizes product override before category/default.");
  }

  const clearForCategory = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
    cookies
  );
  if (!clearForCategory.data?.ok) {
    fail("Clear product override for category inheritance", JSON.stringify(clearForCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow override clearing so category inheritance can be evaluated.");
  }

  const stepCategoryWins = await createInvoiceAndResolveAccount();
  if (stepCategoryWins.accountCode !== categorySales) {
    fail("Verify category inheritance when product override blank", `Expected AccountCode ${categorySales}, got ${stepCategoryWins.accountCode}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolveAccountCodeForProductLine uses category mapping when product override is blank.");
  }

  const clearCategory = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
    cookies
  );
  if (!clearCategory.data?.ok) {
    fail("Clear category mapping for company default inheritance", JSON.stringify(clearCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow category mapping clearing so company default fallback can be evaluated.");
  }

  const stepDefaultWins = await createInvoiceAndResolveAccount();
  if (stepDefaultWins.accountCode !== defaultSales) {
    fail("Verify company default inheritance", `Expected AccountCode ${defaultSales}, got ${stepDefaultWins.accountCode}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolveAccountCodeForProductLine falls back to company defaults after blank product/category mappings.");
  }

  const secondEmail = `product-ovr-other-${stamp}@example.com`;
  const second = await supabase.auth.admin.createUser({ email: secondEmail, password, email_confirm: true });
  if (second.error || !second.data.user?.id) {
    fail("Create second-tenant probe user", second.error?.message || "create second user failed", "scripts/tmp-product-overrides-only-cert.mjs", "Allow second isolated tenant probe user creation.");
  }
  secondUserId = second.data.user.id;

  const comp = await supabase.from("vyron_cost_companies").insert({ name: `POVR Iso ${stamp}`, trading_name: `POVR Iso ${stamp}` }).select("id,name,trading_name").single();
  if (comp.error || !comp.data?.id) {
    fail("Create second company for isolation", comp.error?.message || "create company failed", "src/lib/vyron-saas-workspace.ts", "Fix company creation used by isolation verification.");
  }
  secondCompanyId = comp.data.id;

  const ws2 = await supabase.from("vyron_workspaces").insert({ company_id: secondCompanyId, company_name: comp.data.name, trading_name: comp.data.trading_name, package_name: "Professional", status: "Live", user_limit: 5, owner_user_id: secondUserId, contact_email: secondEmail }).select("id").single();
  if (ws2.error || !ws2.data?.id) {
    fail("Create second workspace for isolation", ws2.error?.message || "create workspace failed", "src/lib/vyron-saas-workspace.ts", "Fix workspace creation used by Product Overrides isolation checks.");
  }
  secondWorkspaceId = ws2.data.id;

  await supabase.from("vyron_user_profiles").upsert({ id: secondUserId, email: secondEmail, first_name: "Iso", surname: "User", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  await supabase.from("vyron_workspace_memberships").insert({ workspace_id: secondWorkspaceId, user_id: secondUserId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });

  const login2 = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: secondEmail, password }) });
  if (!login2.data?.ok || !login2.data?.client || !login2.data?.session) {
    fail("Login second tenant user", JSON.stringify(login2.data), "src/app/api/workspace/login/route.ts", "Fix second tenant workspace login for isolation verification.");
  }
  const cookies2 = cookieHeader(login2.data.client, login2.data.session);

  const crossTenantSave = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: defaultVat } }) },
    cookies2
  );

  if (crossTenantSave.status < 400 || crossTenantSave.data?.ok) {
    fail("Verify multi-company and multi-tenant isolation", "Second tenant could mutate first tenant product overrides.", "src/app/api/integrations/xero/accounts/route.ts", "Enforce workspace/company scoping in save-product path before product update execution.");
  }

  console.log(JSON.stringify({ productOverrides: "PASS" }, null, 2));
} finally {
  try {
    for (const invoiceId of invoiceIds) {
      await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId);
      await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId);
      await supabase.from("vyron_xero_sync_queue").delete().eq("entity_id", invoiceId).eq("entity_type", "Customer Invoice");
    }
  } catch {}
  try { if (productId) await supabase.from("vyron_cost_products").delete().eq("id", productId); } catch {}
  try { if (customerId) await supabase.from("vyron_customers").delete().eq("id", customerId); } catch {}
  try { if (categoryName && companyId) await supabase.from("vyron_cost_categories").delete().eq("company_id", companyId).eq("category_name", categoryName); } catch {}

  try { if (secondWorkspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", secondWorkspaceId); } catch {}
  try { if (secondWorkspaceId) await supabase.from("vyron_workspaces").delete().eq("id", secondWorkspaceId); } catch {}
  try { if (secondCompanyId) await supabase.from("vyron_cost_companies").delete().eq("id", secondCompanyId); } catch {}
  try { if (secondUserId) await supabase.from("vyron_user_profiles").delete().eq("id", secondUserId); } catch {}
  try { if (secondUserId) await supabase.auth.admin.deleteUser(secondUserId); } catch {}

  try { if (workspaceId && userId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId); } catch {}
  try { if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
  try { if (userId) await supabase.auth.admin.deleteUser(userId); } catch {}
}
