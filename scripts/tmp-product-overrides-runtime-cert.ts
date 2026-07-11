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

let resolveAccountCodeForProductLine: (typeof import("../src/lib/vyron-financial-engine"))["resolveAccountCodeForProductLine"];

function fail(runtimeStep: string, rootCause: string, exactFile: string, smallestFix: string): never {
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

function cookieHeader(client: unknown, session: unknown) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function api(path: string, options: RequestInit = {}, cookies = "") {
  const headers = { ...(options.headers || {}) } as Record<string, string>;
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${appBase}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

function pick(catalog: any[], regex: RegExp, exclude = new Set<string>()) {
  for (const row of catalog) {
    const type = String(row.accountType || "").toLowerCase();
    const code = String(row.accountCode || "").trim();
    if (!code || exclude.has(code)) continue;
    if (regex.test(type)) return code;
  }
  return "";
}

async function ensureCategory(companyId: string, categoryName: string) {
  const existing = await supabase
    .from("vyron_cost_categories")
    .select("id")
    .eq("company_id", companyId)
    .ilike("category_name", categoryName)
    .maybeSingle();

  if (existing.data?.id) return;

  const created = await supabase.from("vyron_cost_categories").insert({
    company_id: companyId,
    category_name: categoryName,
    category_type: "Product",
    description: "runtime certification",
    status: "Active",
  });

  if (created.error) {
    fail(
      "Create product category for mapping",
      created.error.message,
      "src/lib/vyron-cost-master-data.ts",
      "Allow category creation with required fields so product category mapping can persist."
    );
  }
}

const stamp = Date.now();
const email = `povr-runtime-${stamp}@example.com`;
const password = "Probe123!";
let userId: string | null = null;
let workspaceId: string | null = null;
let companyId: string | null = null;
let productId: string | null = null;
let categoryName: string | null = null;
let secondUserId: string | null = null;
let secondWorkspaceId: string | null = null;
let secondCompanyId: string | null = null;

async function main() {
  ({ resolveAccountCodeForProductLine } = await import("../src/lib/vyron-financial-engine"));
try {
  const rows = await supabase.from("vyron_xero_workspace_settings").select("workspace_id, connection").limit(100);
  if (rows.error) {
    fail("Resolve runtime workspace", rows.error.message, "src/lib/vyron-xero-connection-store.ts", "Ensure connected Xero workspace settings are readable for certification.");
  }

  const live = (rows.data || []).find((row: any) => {
    const id = String(row.workspace_id || "").trim();
    const c = row.connection || {};
    return UUID_RE.test(id) && c.connected;
  });

  if (!live?.workspace_id) {
    fail("Resolve runtime workspace", "No UUID-scoped connected workspace available.", "src/lib/vyron-xero-api-context.ts", "Use a UUID workspace with active connection for runtime verification.");
  }

  workspaceId = String(live.workspace_id);

  const ws = await supabase.from("vyron_workspaces").select("company_id").eq("id", workspaceId).maybeSingle();
  if (ws.error || !ws.data?.company_id) {
    fail("Resolve workspace company", ws.error?.message || "company_id missing", "src/lib/vyron-workspace-company-resolution.ts", "Ensure workspace resolves to a valid company UUID.");
  }
  companyId = String(ws.data.company_id);

  const createdUser = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (createdUser.error || !createdUser.data.user?.id) {
    fail("Create certification user", createdUser.error?.message || "create user failed", "scripts/tmp-product-overrides-runtime-cert.ts", "Allow creation of test user for runtime verification.");
  }
  userId = createdUser.data.user.id;

  await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "Povr", surname: "Runtime", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  const membership = await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });
  if (membership.error) {
    fail("Grant workspace membership", membership.error.message, "src/lib/vyron-workspace-access.ts", "Ensure certification user can be assigned owner role.");
  }

  const login = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!login.data?.ok || !login.data.client || !login.data.session) {
    fail("Authenticate user", JSON.stringify(login.data), "src/app/api/workspace/login/route.ts", "Fix workspace login response/session cookies.");
  }

  const cookies = cookieHeader(login.data.client, login.data.session);

  const loadProducts = await api("/api/products", { method: "GET" }, cookies);
  if (!loadProducts.data?.ok) {
    fail("Financial Override section loads", JSON.stringify(loadProducts.data), "src/app/api/products/route.ts", "Fix products listing endpoint used by Product Manager.");
  }

  const accounts = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
  if (!accounts.data?.ok) {
    fail("Load financial account catalog", JSON.stringify(accounts.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix account catalog endpoint dependency for overrides.");
  }

  const catalog = Array.isArray(accounts.data?.accountCatalog?.accounts) ? accounts.data.accountCatalog.accounts : [];
  if (!catalog.length) {
    fail("Load financial account catalog", "No account catalog rows returned.", "src/lib/vyron-financial-engine.ts", "Sync account catalog before Product Overrides runtime checks.");
  }

  const used = new Set<string>();
  const defaultSales = pick(catalog, /revenue|income|otherincome/, used);
  used.add(defaultSales);
  const categorySales = pick(catalog, /revenue|income|otherincome/, used) || defaultSales;
  used.add(categorySales);
  const productSales = pick(catalog, /revenue|income|otherincome/, used) || categorySales;
  const vat = String(accounts.data?.taxTypes?.[0] || "");

  if (!defaultSales) {
    fail("Resolve sales accounts for overrides", "No revenue/income account available.", "src/lib/vyron-xero-integration.ts", "Ensure synced catalog contains revenue accounts for sales mappings.");
  }

  const saveDefaults = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-defaults", mapping: { salesAccount: defaultSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
    cookies
  );

  if (!saveDefaults.data?.ok) {
    fail("Save defaults prerequisite", JSON.stringify(saveDefaults.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-defaults for runtime setup.");
  }

  categoryName = `POVR-ONLY-${stamp}`;
  await ensureCategory(companyId, categoryName);

  const saveCategory = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: categorySales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
    cookies
  );

  if (!saveCategory.data?.ok) {
    fail("Save category mapping prerequisite", JSON.stringify(saveCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-category for runtime inheritance checks.");
  }

  const createdProduct = await api(
    "/api/products",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: `POVR Item ${stamp}`, product_category: categoryName, selling_price: 30, total_cost: 15, target_gp: 30, product_status: "Active" }),
    },
    cookies
  );

  if (!createdProduct.data?.ok || !createdProduct.data?.product?.id) {
    fail("Create test product", JSON.stringify(createdProduct.data), "src/app/api/products/route.ts", "Fix product creation used by override runtime path.");
  }

  productId = String(createdProduct.data.product.id);

  const loadInitial = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  if (!loadInitial.data?.ok || !loadInitial.data?.product) {
    fail("Existing values load", JSON.stringify(loadInitial.data), "src/app/api/products/[id]/route.ts", "Fix product detail API to load existing financial override values.");
  }

  const saveOverride = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
    cookies
  );

  if (!saveOverride.data?.ok) {
    fail("Save product override", JSON.stringify(saveOverride.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-product endpoint for valid override payload.");
  }

  const reloadAfterSave = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  if (!reloadAfterSave.data?.ok || !String(reloadAfterSave.data.product?.financial_sales_account_id || "").trim()) {
    fail("Reload saved override", JSON.stringify(reloadAfterSave.data), "src/lib/vyron-financial-engine.ts", "Persist sales override on product and return it on product reload.");
  }

  const resolvedProduct = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId }, "salesAccount");
  if (String(resolvedProduct || "").trim() !== productSales) {
    fail("Product Override precedence", `Expected ${productSales}, got ${String(resolvedProduct || "")}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolver prioritizes product override before category/default.");
  }

  const clearProduct = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
    cookies
  );

  if (!clearProduct.data?.ok) {
    fail("Clear override", JSON.stringify(clearProduct.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow blank product override values for inheritance.");
  }

  const reloadAfterClear = await api(`/api/products/${productId}`, { method: "GET" }, cookies);
  if (String(reloadAfterClear.data?.product?.financial_sales_account_id || "").trim()) {
    fail("Persistence after clear", "Product override value did not clear to null.", "src/lib/vyron-financial-engine.ts", "Persist blank override fields as null for inheritance behavior.");
  }

  const resolvedCategory = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId }, "salesAccount", { productCategory: categoryName });
  if (String(resolvedCategory || "").trim() !== categorySales) {
    fail("Inheritance from Category Mapping", `Expected ${categorySales}, got ${String(resolvedCategory || "")}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolver falls back to category mapping when product override is blank.");
  }

  const clearCategory = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
    cookies
  );

  if (!clearCategory.data?.ok) {
    fail("Clear category mapping", JSON.stringify(clearCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow clearing category mapping for fallback verification.");
  }

  const resolvedDefault = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId }, "salesAccount", { productCategory: categoryName });
  if (String(resolvedDefault || "").trim() !== defaultSales) {
    fail("Company default fallback", `Expected ${defaultSales}, got ${String(resolvedDefault || "")}.`, "src/lib/vyron-financial-engine.ts", "Ensure resolver falls back to company default after blank product/category mappings.");
  }

  const secondEmail = `povr-iso-${stamp}@example.com`;
  const createdUser2 = await supabase.auth.admin.createUser({ email: secondEmail, password, email_confirm: true });
  if (createdUser2.error || !createdUser2.data.user?.id) {
    fail("Create isolated tenant user", createdUser2.error?.message || "create second user failed", "scripts/tmp-product-overrides-runtime-cert.ts", "Allow isolated tenant probe user creation.");
  }
  secondUserId = createdUser2.data.user.id;

  const comp2 = await supabase.from("vyron_cost_companies").insert({ name: `POVR ISO ${stamp}`, trading_name: `POVR ISO ${stamp}` }).select("id,name,trading_name").single();
  if (comp2.error || !comp2.data?.id) {
    fail("Create isolated tenant company", comp2.error?.message || "create company failed", "src/lib/vyron-saas-workspace.ts", "Fix company create flow for isolation probe.");
  }
  secondCompanyId = String(comp2.data.id);

  const ws2 = await supabase
    .from("vyron_workspaces")
    .insert({ company_id: secondCompanyId, company_name: comp2.data.name, trading_name: comp2.data.trading_name, package_name: "Professional", status: "Live", user_limit: 5, owner_user_id: secondUserId, contact_email: secondEmail })
    .select("id")
    .single();

  if (ws2.error || !ws2.data?.id) {
    fail("Create isolated tenant workspace", ws2.error?.message || "create workspace failed", "src/lib/vyron-saas-workspace.ts", "Fix workspace create flow for isolation probe.");
  }
  secondWorkspaceId = String(ws2.data.id);

  await supabase.from("vyron_user_profiles").upsert({ id: secondUserId, email: secondEmail, first_name: "Iso", surname: "User", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
  await supabase.from("vyron_workspace_memberships").insert({ workspace_id: secondWorkspaceId, user_id: secondUserId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });

  const login2 = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: secondEmail, password }) });
  if (!login2.data?.ok || !login2.data.client || !login2.data.session) {
    fail("Authenticate isolated tenant user", JSON.stringify(login2.data), "src/app/api/workspace/login/route.ts", "Fix isolated tenant login/session flow.");
  }
  const cookies2 = cookieHeader(login2.data.client, login2.data.session);

  const crossTenantSave = await api(
    "/api/integrations/xero/accounts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
    cookies2
  );

  if (crossTenantSave.status < 400 || crossTenantSave.data?.ok) {
    fail("Multi-company isolation", "Second tenant was able to mutate first tenant product override.", "src/app/api/integrations/xero/accounts/route.ts", "Enforce company/workspace scoping before product override update.");
  }

  console.log(JSON.stringify({ productOverrides: "PASS" }, null, 2));
} finally {
  try { if (productId) await supabase.from("vyron_cost_products").delete().eq("id", productId); } catch {}
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
}

main().catch((error) => {
  fail(
    "Run Product Financial Overrides certification",
    error instanceof Error ? error.message : "Unexpected runtime error.",
    "scripts/tmp-product-overrides-runtime-cert.ts",
    "Fix runtime probe execution error so Product Financial Overrides checks can run."
  );
});
