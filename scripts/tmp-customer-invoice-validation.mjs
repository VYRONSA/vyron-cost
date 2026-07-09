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
  console.error("FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
    data = { _raw: raw.slice(0, 1000) };
  }
  return { status: response.status, ok: response.ok, data };
}

const status = new Map();
function mark(name, ok) {
  status.set(name, ok ? "PASS" : "FAIL");
}

async function main() {
  const stamp = Date.now();
  const email = `invoice-e2e-${stamp}@example.com`;
  const password = "InvoiceE2E123!";

  let userId = null;
  let companyId = null;
  let workspaceId = null;
  let customerId = null;
  let productId = null;
  let invoiceId = null;
  let stockItemId = null;

  try {
    const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "auth create failed");
    userId = auth.data.user.id;

    const c = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `Invoice E2E ${stamp}`, trading_name: `Invoice E2E ${stamp}` })
      .select("id,name,trading_name")
      .single();
    if (c.error) throw c.error;
    companyId = c.data.id;

    const ws = await supabase
      .from("vyron_workspaces")
      .insert({
        company_id: companyId,
        company_name: c.data.name,
        trading_name: c.data.trading_name,
        package_name: "Professional",
        status: "Live",
        user_limit: 5,
        owner_user_id: userId,
        contact_email: email,
      })
      .select("id")
      .single();
    if (ws.error) throw ws.error;
    workspaceId = ws.data.id;

    await supabase.from("vyron_user_profiles").upsert(
      {
        id: userId,
        email,
        first_name: "Invoice",
        surname: "E2E",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    await supabase.from("vyron_workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: userId,
      role: "OWNER",
      status: "Active",
      joined_at: new Date().toISOString(),
    });

    const login = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!login.data?.ok) throw new Error(`login failed: ${JSON.stringify(login.data)}`);

    const cookies = cookieHeader(login.data.client, login.data.session);
    const headers = { "Content-Type": "application/json", Cookie: cookies };

    const customer = await api(
      "/api/customers",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ customerName: `Invoice Customer ${stamp}`, terms: "30 Days", status: "Active" }),
      },
      cookies
    );
    mark("Create", Boolean(customer.data?.ok));
    if (!customer.data?.ok) throw new Error(`customer create failed: ${JSON.stringify(customer.data)}`);
    customerId = customer.data.customer.id;

    const product = await api(
      "/api/products",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_name: `Invoice Product ${stamp}`,
          product_category: "Finished Goods",
          selling_price: 30,
          total_cost: 15,
          target_gp: 30,
          product_status: "Active",
          sku: `INV-${stamp}`,
        }),
      },
      cookies
    );
    if (!product.data?.ok) throw new Error(`product create failed: ${JSON.stringify(product.data)}`);
    productId = product.data.product.id;

    const stockCreate = await api(
      "/api/inventory/stock",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          entityType: "finished_goods",
          entityId: productId,
          description: `Invoice Product ${stamp}`,
          itemCode: `FG-${stamp}`,
          unit: "unit",
          currentCost: 15,
          openingQty: 50,
          openingDate: "2026-01-01",
          openingNote: "invoice e2e",
        }),
      },
      cookies
    );
    if (!stockCreate.data?.ok) throw new Error(`stock create failed: ${JSON.stringify(stockCreate.data)}`);
    stockItemId = stockCreate.data.item.id;

    const before = await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", stockItemId).single();
    const beforeQty = Number(before.data?.qty_on_hand || 0);

    const created = await api(
      "/api/customer-invoices",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId,
          customerName: `Invoice Customer ${stamp}`,
          lines: [
            {
              productId,
              productName: `Invoice Product ${stamp}`,
              quantity: 2,
              sellingPrice: 30,
              costPerUnit: 15,
            },
          ],
        }),
      },
      cookies
    );

    const createOk = Boolean(created.data?.ok && created.data.invoice?.id);
    mark("Create", createOk);
    mark("Save", createOk);
    if (!createOk) throw new Error(`invoice create failed: ${JSON.stringify(created.data)}`);
    invoiceId = created.data.invoice.id;

    const post = await api(
      `/api/customer-invoices/${invoiceId}/post-stock`,
      { method: "POST", headers, body: JSON.stringify({}) },
      cookies
    );
    mark("Post Stock", Boolean(post.data?.ok));
    if (!post.data?.ok) throw new Error(`post-stock failed: ${JSON.stringify(post.data)}`);

    const after = await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", stockItemId).single();
    const afterQty = Number(after.data?.qty_on_hand || 0);
    mark("Verify inventory reduction", afterQty === beforeQty - 2);

    const ledger = await supabase
      .from("vyron_cost_stock_ledger")
      .select("id,movement_type,reference_id")
      .eq("company_id", companyId)
      .eq("reference_id", invoiceId)
      .eq("movement_type", "Customer Sale")
      .limit(1);
    mark("Verify stock ledger entry", !ledger.error && (ledger.data || []).length > 0);

    const customerRow = await supabase.from("vyron_customers").select("outstanding_invoices,total_sales").eq("id", customerId).single();
    const outstanding = Number(customerRow.data?.outstanding_invoices || 0);
    const totalSales = Number(customerRow.data?.total_sales || 0);
    const invoiceSales = Number(created.data?.invoice?.sales_value || 0);
    mark("Verify customer balance update", outstanding >= invoiceSales && totalSales >= invoiceSales);

    const statement = await api(`/api/customer-statements?customerId=${encodeURIComponent(customerId)}`, { headers: { Cookie: cookies } }, cookies);
    const stmtOutstanding = Number(statement.data?.statement?.outstanding || 0);
    mark("Verify customer statement update", Boolean(statement.data?.ok) && stmtOutstanding >= invoiceSales);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("WORKFLOW_ERROR", msg);
  } finally {
    try { if (invoiceId) await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId); } catch {}
    try { if (invoiceId) await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", workspaceId); } catch {}
    try { if (companyId) await supabase.from("vyron_cost_companies").delete().eq("id", companyId); } catch {}
    try { if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
    try { if (userId) await supabase.auth.admin.deleteUser(userId); } catch {}
  }

  const stages = [
    "Create",
    "Save",
    "Post Stock",
    "Verify inventory reduction",
    "Verify stock ledger entry",
    "Verify customer balance update",
    "Verify customer statement update",
  ];

  for (const stage of stages) {
    console.log(`${stage}: ${status.get(stage) || "Runtime Validation Required"}`);
  }

  const allPass = stages.every((s) => status.get(s) === "PASS");
  process.exit(allPass ? 0 : 2);
}

main();
