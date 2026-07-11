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

function fail(runtimeStep: string, rootCause: string, exactFile: string, smallestFix: string): never {
  console.log(
    JSON.stringify(
      {
        module: "Invoice Export Mapping",
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
    description: "invoice mapping runtime cert",
    status: "Active",
  });

  if (created.error) {
    fail("Create category", created.error.message, "src/lib/vyron-cost-master-data.ts", "Allow creation of category rows required for invoice mapping inheritance test.");
  }
}

const stamp = Date.now();
const email = `invoice-map-${stamp}@example.com`;
const password = "Probe123!";
let userId: string | null = null;
let workspaceId: string | null = null;
let companyId: string | null = null;
let productId: string | null = null;
let categoryName: string | null = null;

async function main() {
  const { resolveAccountCodeForProductLine, resolveVatTaxTypeForProductLine } = await import("../src/lib/vyron-financial-engine");

  try {
    const rows = await supabase.from("vyron_xero_workspace_settings").select("workspace_id, connection").limit(100);
    if (rows.error) fail("Resolve workspace", rows.error.message, "src/lib/vyron-xero-connection-store.ts", "Ensure connected workspace settings are readable.");

    const live = (rows.data || []).find((row: any) => {
      const id = String(row.workspace_id || "").trim();
      const c = row.connection || {};
      return UUID_RE.test(id) && c.connected;
    });

    if (!live?.workspace_id) {
      fail("Resolve workspace", "No UUID-scoped connected workspace found.", "src/lib/vyron-xero-api-context.ts", "Use a UUID workspace with active Xero connection for invoice mapping checks.");
    }

    workspaceId = String(live.workspace_id);

    const ws = await supabase.from("vyron_workspaces").select("company_id").eq("id", workspaceId).maybeSingle();
    if (ws.error || !ws.data?.company_id) {
      fail("Resolve company", ws.error?.message || "company_id missing", "src/lib/vyron-workspace-company-resolution.ts", "Ensure workspace resolves to a valid company UUID.");
    }
    companyId = String(ws.data.company_id);

    const u = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error || !u.data.user?.id) fail("Create user", u.error?.message || "create user failed", "scripts/tmp-invoice-export-mapping-cert.ts", "Allow creation of runtime probe user.");
    userId = u.data.user.id;

    await supabase.from("vyron_user_profiles").upsert({ id: userId, email, first_name: "Invoice", surname: "Map", status: "Active", updated_at: new Date().toISOString() }, { onConflict: "id" });
    const membership = await supabase.from("vyron_workspace_memberships").insert({ workspace_id: workspaceId, user_id: userId, role: "OWNER", status: "Active", joined_at: new Date().toISOString() });
    if (membership.error) fail("Grant membership", membership.error.message, "src/lib/vyron-workspace-access.ts", "Ensure runtime probe user can access workspace APIs.");

    const login = await api("/api/workspace/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!login.data?.ok || !login.data.client || !login.data.session) {
      fail("Authenticate user", JSON.stringify(login.data), "src/app/api/workspace/login/route.ts", "Fix workspace login/session response.");
    }
    const cookies = cookieHeader(login.data.client, login.data.session);

    const accounts = await api("/api/integrations/xero/accounts", { method: "GET" }, cookies);
    if (!accounts.data?.ok) {
      fail("Load account catalog", JSON.stringify(accounts.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix account catalog endpoint for invoice mapping checks.");
    }

    const catalog = Array.isArray(accounts.data?.accountCatalog?.accounts) ? accounts.data.accountCatalog.accounts : [];
    if (!catalog.length) {
      fail("Load account catalog", "No account catalog rows returned.", "src/lib/vyron-financial-engine.ts", "Sync chart of accounts before invoice mapping verification.");
    }

    const used = new Set<string>();
    const defaultSales = pick(catalog, /revenue|income|otherincome/, used);
    used.add(defaultSales);
    const categorySales = pick(catalog, /revenue|income|otherincome/, used) || defaultSales;
    used.add(categorySales);
    const productSales = pick(catalog, /revenue|income|otherincome/, used) || categorySales;
    const vat = String(accounts.data?.taxTypes?.[0] || "");

    if (!defaultSales) {
      fail("Resolve mapping account codes", "No revenue/income account found.", "src/lib/vyron-xero-integration.ts", "Ensure synced catalog has at least one revenue account.");
    }

    const saveDefaults = await api(
      "/api/integrations/xero/accounts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-defaults", mapping: { salesAccount: defaultSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
      cookies
    );
    if (!saveDefaults.data?.ok) {
      fail("Save company defaults", JSON.stringify(saveDefaults.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-defaults action for invoice mapping prerequisites.");
    }

    categoryName = `INV-MAP-${stamp}`;
    await ensureCategory(companyId, categoryName);

    const saveCategory = await api(
      "/api/integrations/xero/accounts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: categorySales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
      cookies
    );
    if (!saveCategory.data?.ok) {
      fail("Save category mapping", JSON.stringify(saveCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-category action for invoice mapping prerequisites.");
    }

    const product = await api(
      "/api/products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: `INV Product ${stamp}`, product_category: categoryName, selling_price: 30, total_cost: 15, target_gp: 30, product_status: "Active" }),
      },
      cookies
    );

    if (!product.data?.ok || !product.data?.product?.id) {
      fail("Create product", JSON.stringify(product.data), "src/app/api/products/route.ts", "Fix product creation used by invoice mapping certification.");
    }

    productId = String(product.data.product.id);

    const saveProduct = await api(
      "/api/integrations/xero/accounts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: productSales, costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: vat } }) },
      cookies
    );

    if (!saveProduct.data?.ok) {
      fail("Save product override", JSON.stringify(saveProduct.data), "src/app/api/integrations/xero/accounts/route.ts", "Fix save-product before invoice mapping resolution checks.");
    }

    const resolvedProduct = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId, productCategory: categoryName }, "salesAccount");
    const resolvedProductVat = await resolveVatTaxTypeForProductLine({ workspaceId, companyId, productId, productCategory: categoryName });
    if (String(resolvedProduct || "").trim() !== productSales) {
      fail("Resolve Product Override AccountCode", `Expected ${productSales}, got ${String(resolvedProduct || "")}.`, "src/lib/vyron-xero-sync-engine.ts", "Ensure invoice export uses product override before category/default.");
    }
    if (vat && String(resolvedProductVat || "").trim() !== vat) {
      fail("Resolve Product Override TaxType", `Expected ${vat}, got ${String(resolvedProductVat || "")}.`, "src/lib/vyron-xero-sync-engine.ts", "Ensure invoice export resolves VAT from product/category/default hierarchy.");
    }

    const clearProduct = await api(
      "/api/integrations/xero/accounts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-product", productId, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
      cookies
    );

    if (!clearProduct.data?.ok) {
      fail("Clear product override", JSON.stringify(clearProduct.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow blank product override values for hierarchy fallback.");
    }

    const resolvedCategory = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId, productCategory: categoryName }, "salesAccount");
    if (String(resolvedCategory || "").trim() !== categorySales) {
      fail("Resolve Category Mapping AccountCode", `Expected ${categorySales}, got ${String(resolvedCategory || "")}.`, "src/lib/vyron-xero-sync-engine.ts", "Ensure invoice export uses category mapping when product override is blank.");
    }

    const clearCategory = await api(
      "/api/integrations/xero/accounts",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-category", categoryName, mapping: { salesAccount: "", costOfSalesAccount: "", inventoryAssetAccount: "", vatStandard: "" } }) },
      cookies
    );

    if (!clearCategory.data?.ok) {
      fail("Clear category mapping", JSON.stringify(clearCategory.data), "src/app/api/integrations/xero/accounts/route.ts", "Allow blank category mapping values for company default fallback.");
    }

    const resolvedDefault = await resolveAccountCodeForProductLine({ workspaceId, companyId, productId, productCategory: categoryName }, "salesAccount");
    if (String(resolvedDefault || "").trim() !== defaultSales) {
      fail("Resolve Company Default AccountCode", `Expected ${defaultSales}, got ${String(resolvedDefault || "")}.`, "src/lib/vyron-xero-sync-engine.ts", "Ensure invoice export falls back to company defaults after blank product/category mapping.");
    }

    console.log(JSON.stringify({ invoiceExportMapping: "PASS" }, null, 2));
  } finally {
    try { if (productId) await supabase.from("vyron_cost_products").delete().eq("id", productId); } catch {}
    try { if (categoryName && companyId) await supabase.from("vyron_cost_categories").delete().eq("company_id", companyId).eq("category_name", categoryName); } catch {}

    try { if (workspaceId && userId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", userId); } catch {}
    try { if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
    try { if (userId) await supabase.auth.admin.deleteUser(userId); } catch {}
  }
}

main().catch((error) => {
  fail(
    "Run invoice export mapping certification",
    error instanceof Error ? error.message : "Unexpected runtime error.",
    "scripts/tmp-invoice-export-mapping-cert.ts",
    "Fix invoice mapping probe execution so runtime verification can complete."
  );
});
