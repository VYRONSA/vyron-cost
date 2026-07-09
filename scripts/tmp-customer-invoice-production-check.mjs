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
  console.error("FATAL", JSON.stringify({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
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

function extractSqlState(payload) {
  const text = JSON.stringify(payload || {});
  const m = text.match(/\b([0-9A-Z]{5})\b/);
  return m ? m[1] : null;
}

function fail(details) {
  console.log("FIRST_FAILURE", JSON.stringify(details, null, 2));
  process.exitCode = 2;
}

async function main() {
  const stamp = Date.now();
  const email = `prod-invoice-check-${stamp}@example.com`;
  const password = "ProdInvoice123!";

  const stage = {
    Create: "PENDING",
    Save: "PENDING",
    "Post Stock": "PENDING",
    "Finished goods inventory reduction": "PENDING",
    "Stock Ledger entry": "PENDING",
    "Inventory Audit Log entry": "PENDING",
    "Customer outstanding balance update": "PENDING",
    "Customer statement update": "PENDING",
  };

  let userId = null;
  let companyId = null;
  let workspaceId = null;
  let customerId = null;
  let productId = null;
  let invoiceId = null;
  let stockItemId = null;
  let cookies = "";

  try {
    const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (auth.error || !auth.data.user?.id) {
      return fail({
        stage: "Auth bootstrap",
        rootCauseClass: "Data",
        serviceMethod: "supabase.auth.admin.createUser",
        databaseError: auth.error || null,
        sqlstate: auth.error?.code || null,
        stackTrace: auth.error?.message || "n/a",
      });
    }
    userId = auth.data.user.id;

    const c = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `Prod Invoice Check ${stamp}`, trading_name: `Prod Invoice Check ${stamp}` })
      .select("id,name,trading_name")
      .single();
    if (c.error) {
      return fail({
        stage: "Company bootstrap",
        rootCauseClass: "Data",
        serviceMethod: "vyron_cost_companies.insert",
        databaseError: c.error,
        sqlstate: c.error.code || null,
        stackTrace: c.error.message,
      });
    }
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
    if (ws.error) {
      return fail({
        stage: "Workspace bootstrap",
        rootCauseClass: "Data",
        serviceMethod: "vyron_workspaces.insert",
        databaseError: ws.error,
        sqlstate: ws.error.code || null,
        stackTrace: ws.error.message,
      });
    }
    workspaceId = ws.data.id;

    await supabase.from("vyron_user_profiles").upsert(
      {
        id: userId,
        email,
        first_name: "Prod",
        surname: "Check",
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
    if (!login.data?.ok) {
      return fail({
        stage: "Workspace login",
        httpStatus: login.status,
        rootCauseClass: "Permission/RLS",
        serviceMethod: "POST /api/workspace/login",
        databaseError: login.data?.error || login.data || null,
        sqlstate: extractSqlState(login.data),
        stackTrace: "Not exposed by API route response",
      });
    }

    cookies = cookieHeader(login.data.client, login.data.session);
    const headers = { "Content-Type": "application/json", Cookie: cookies };

    const customer = await api(
      "/api/customers",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ customerName: `Prod Invoice Customer ${stamp}`, terms: "30 Days", status: "Active" }),
      },
      cookies
    );
    if (!customer.data?.ok) {
      return fail({
        stage: "Create Customer",
        httpStatus: customer.status,
        rootCauseClass: "Data",
        serviceMethod: "POST /api/customers",
        databaseError: customer.data?.error || customer.data || null,
        sqlstate: extractSqlState(customer.data),
        stackTrace: "Not exposed by API route response",
      });
    }
    customerId = customer.data.customer.id;

    const product = await api(
      "/api/products",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_name: `Prod Invoice Product ${stamp}`,
          product_category: "Finished Goods",
          selling_price: 30,
          total_cost: 15,
          target_gp: 30,
          product_status: "Active",
          sku: `PRD-${stamp}`,
        }),
      },
      cookies
    );
    if (!product.data?.ok) {
      return fail({
        stage: "Create Product",
        httpStatus: product.status,
        rootCauseClass: "Data",
        serviceMethod: "POST /api/products",
        databaseError: product.data?.error || product.data || null,
        sqlstate: extractSqlState(product.data),
        stackTrace: "Not exposed by API route response",
      });
    }
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
          description: `Prod Invoice Product ${stamp}`,
          itemCode: `FG-${stamp}`,
          unit: "unit",
          currentCost: 15,
          openingQty: 50,
          openingDate: "2026-01-01",
          openingNote: "prod invoice check",
        }),
      },
      cookies
    );
    if (!stockCreate.data?.ok) {
      return fail({
        stage: "Create Stock Item",
        httpStatus: stockCreate.status,
        rootCauseClass: "Data",
        serviceMethod: "POST /api/inventory/stock",
        databaseError: stockCreate.data?.error || stockCreate.data || null,
        sqlstate: extractSqlState(stockCreate.data),
        stackTrace: "Not exposed by API route response",
      });
    }
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
          customerName: `Prod Invoice Customer ${stamp}`,
          lines: [
            {
              productId,
              productName: `Prod Invoice Product ${stamp}`,
              quantity: 2,
              sellingPrice: 30,
              costPerUnit: 15,
            },
          ],
        }),
      },
      cookies
    );

    if (!(created.data?.ok && created.data?.invoice?.id)) {
      return fail({
        stage: "Create Customer Invoice",
        httpStatus: created.status,
        rootCauseClass: "Application logic",
        serviceMethod: "POST /api/customer-invoices",
        databaseError: created.data?.error || created.data || null,
        sqlstate: extractSqlState(created.data),
        stackTrace: "Not exposed by API route response",
      });
    }

    invoiceId = created.data.invoice.id;
    stage.Create = "PASS";
    stage.Save = "PASS";

    const post = await api(
      `/api/customer-invoices/${invoiceId}/post-stock`,
      { method: "POST", headers, body: JSON.stringify({}) },
      cookies
    );

    if (!post.data?.ok) {
      return fail({
        stage: "Post Stock",
        httpStatus: post.status,
        rootCauseClass: post.status === 500 ? "Constraint" : "Application logic",
        serviceMethod: `POST /api/customer-invoices/${invoiceId}/post-stock`,
        databaseError: post.data?.error || post.data || null,
        sqlstate: extractSqlState(post.data),
        stackTrace: "Not exposed by API route response",
        fileLine: "Not exposed by API route response",
        failingSqlOrMethod: "postCustomerInvoiceStock update vyron_customer_invoices status",
      });
    }
    stage["Post Stock"] = "PASS";

    const after = await supabase.from("vyron_cost_stock_items").select("qty_on_hand").eq("id", stockItemId).single();
    const afterQty = Number(after.data?.qty_on_hand || 0);
    if (!(afterQty === beforeQty - 2)) {
      return fail({
        stage: "Finished goods inventory reduction",
        rootCauseClass: "Application logic",
        serviceMethod: "post stock movement verification",
        databaseError: { expected: beforeQty - 2, actual: afterQty },
        sqlstate: null,
        stackTrace: "Verification assertion failed",
      });
    }
    stage["Finished goods inventory reduction"] = "PASS";

    const ledger = await supabase
      .from("vyron_cost_stock_ledger")
      .select("id,movement_type,reference_id")
      .eq("company_id", companyId)
      .eq("reference_id", invoiceId)
      .eq("movement_type", "Customer Sale")
      .limit(1);
    if (ledger.error || (ledger.data || []).length === 0) {
      return fail({
        stage: "Stock Ledger entry",
        rootCauseClass: ledger.error ? "Schema" : "Application logic",
        serviceMethod: "vyron_cost_stock_ledger verification",
        databaseError: ledger.error || "Ledger row not found",
        sqlstate: ledger.error?.code || null,
        stackTrace: ledger.error?.message || "Verification assertion failed",
      });
    }
    stage["Stock Ledger entry"] = "PASS";

    const audit = await supabase
      .from("vyron_inventory_audit_log")
      .select("id,event_type,reference_type,reference_id")
      .eq("company_id", companyId)
      .eq("reference_type", "customer_invoice")
      .eq("reference_id", invoiceId)
      .limit(5);
    if (audit.error || (audit.data || []).length === 0) {
      return fail({
        stage: "Inventory Audit Log entry",
        rootCauseClass: audit.error ? "Schema" : "Application logic",
        serviceMethod: "vyron_inventory_audit_log verification",
        databaseError: audit.error || "Audit row not found",
        sqlstate: audit.error?.code || null,
        stackTrace: audit.error?.message || "Verification assertion failed",
      });
    }
    stage["Inventory Audit Log entry"] = "PASS";

    const customerRow = await supabase
      .from("vyron_customers")
      .select("outstanding_invoices,total_sales")
      .eq("id", customerId)
      .single();
    const outstanding = Number(customerRow.data?.outstanding_invoices || 0);
    const totalSales = Number(customerRow.data?.total_sales || 0);
    const invoiceSales = Number(created.data?.invoice?.sales_value || 0);

    if (!(outstanding >= invoiceSales && totalSales >= invoiceSales)) {
      return fail({
        stage: "Customer outstanding balance update",
        rootCauseClass: "Application logic",
        serviceMethod: "vyron_customers sales history update verification",
        databaseError: { outstanding, totalSales, invoiceSales },
        sqlstate: null,
        stackTrace: "Verification assertion failed",
      });
    }
    stage["Customer outstanding balance update"] = "PASS";

    const statement = await api(
      `/api/customer-statements?customerId=${encodeURIComponent(customerId)}`,
      { headers: { Cookie: cookies } },
      cookies
    );
    const stmtOutstanding = Number(statement.data?.statement?.outstanding || 0);

    if (!(statement.data?.ok && stmtOutstanding >= invoiceSales)) {
      return fail({
        stage: "Customer statement update",
        httpStatus: statement.status,
        rootCauseClass: "Application logic",
        serviceMethod: "GET /api/customer-statements",
        databaseError: statement.data?.error || statement.data || null,
        sqlstate: extractSqlState(statement.data),
        stackTrace: "Not exposed by API route response",
      });
    }
    stage["Customer statement update"] = "PASS";

    console.log("WORKFLOW_STATUS", JSON.stringify(stage, null, 2));
    console.log("WORKFLOW_RESULT", "PASS");
  } catch (error) {
    fail({
      stage: "Unhandled",
      rootCauseClass: "Other proven cause",
      serviceMethod: "script runtime",
      databaseError: null,
      sqlstate: null,
      stackTrace: error instanceof Error ? error.stack : String(error),
    });
  } finally {
    try { if (invoiceId) await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId); } catch {}
    try { if (invoiceId) await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId); } catch {}
    try { if (workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", workspaceId); } catch {}
    try { if (companyId) await supabase.from("vyron_cost_companies").delete().eq("id", companyId); } catch {}
    try { if (userId) await supabase.from("vyron_user_profiles").delete().eq("id", userId); } catch {}
    try { if (userId) await supabase.auth.admin.deleteUser(userId); } catch {}
  }
}

main();
