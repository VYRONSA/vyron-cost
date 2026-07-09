import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

function normaliseCustomerLikeUi(raw, index) {
  const name = String(
    raw?.name ||
      raw?.customerName ||
      raw?.customer_name ||
      raw?.companyName ||
      raw?.company_name ||
      raw?.tradingName ||
      raw?.trading_name ||
      ""
  ).trim();
  if (!name) return null;

  return {
    id: String(raw?.id || raw?.customerId || `customer-${index}`),
    name,
    email: String(
      raw?.invoiceEmail ||
        raw?.invoice_email ||
        raw?.email ||
        raw?.customerEmail ||
        raw?.customer_email ||
        raw?.contactEmail ||
        raw?.contact_email ||
        ""
    ).trim(),
    vatNumber: String(raw?.vatNumber || raw?.vat_number || raw?.customerVatNumber || raw?.vat || "N/A").trim(),
    terms: String(raw?.terms || raw?.paymentTerms || raw?.payment_terms || "30 Days").trim() || "30 Days",
  };
}

async function json(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const stamp = Date.now();
  const companyName = `SO Workflow ${stamp}`;
  const ownerEmail = `so-owner-${stamp}@example.com`;
  const ownerPassword = "SalesOrder123!";

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: companyName, trading_name: companyName })
    .select("*")
    .single();
  if (companyError) throw companyError;

  const { data: workspace, error: wsError } = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.id,
      company_name: company.name,
      trading_name: company.trading_name,
      package_name: "Professional",
      status: "Live",
      user_limit: 5,
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const ownerAuth = await supabase.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { first_name: "SO", surname: "Owner" },
  });
  if (ownerAuth.error || !ownerAuth.data.user?.id) {
    throw new Error(ownerAuth.error?.message || "Owner setup failed");
  }
  const ownerUserId = ownerAuth.data.user.id;

  const workspaceOwner = await supabase
    .from("vyron_workspaces")
    .update({ owner_user_id: ownerUserId, contact_email: ownerEmail })
    .eq("id", workspace.id);
  if (workspaceOwner.error) throw workspaceOwner.error;

  const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
    {
      id: ownerUserId,
      email: ownerEmail,
      first_name: "SO",
      surname: "Owner",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileUpsert.error) throw profileUpsert.error;

  const membershipInsert = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.id,
    user_id: ownerUserId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (membershipInsert.error && !String(membershipInsert.error.message || "").includes("duplicate key")) {
    throw membershipInsert.error;
  }

  const ownerLogin = await json("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  if (!ownerLogin.data?.ok) throw new Error(`Owner login failed: ${ownerLogin.data?.error || ownerLogin.status}`);

  const cookies = cookieHeader(ownerLogin.data.client, ownerLogin.data.session);
  const authedHeaders = { "Content-Type": "application/json", Cookie: cookies };

  const createCustomerRes = await json(
    "/api/customers",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        customerName: `Workflow Customer ${stamp}`,
        contactEmail: `customer-${stamp}@example.com`,
        invoiceEmail: `invoice-${stamp}@example.com`,
        status: "Active",
      }),
    },
    cookies
  );
  if (!createCustomerRes.data?.ok || !createCustomerRes.data?.customer?.id) {
    throw new Error(`Create customer failed: ${createCustomerRes.data?.error || createCustomerRes.status}`);
  }
  const customerId = createCustomerRes.data.customer.id;

  const customersRes = await json("/api/customers", { headers: { Cookie: cookies } });
  if (!customersRes.data?.ok || !Array.isArray(customersRes.data.customers)) {
    throw new Error(`List customers failed: ${customersRes.data?.error || customersRes.status}`);
  }
  const customerRow = customersRes.data.customers.find((row) => row.id === customerId);
  if (!customerRow) throw new Error("Created customer not returned by /api/customers");
  const normalised = normaliseCustomerLikeUi(customerRow, 0);
  if (!normalised || !normalised.name) throw new Error("Customer normaliser produced empty result for API row");

  const recipeCreate = await json(
    "/api/recipes",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        recipe_name: `SO BOM ${stamp}`,
        category: "General",
        yield_qty: 1,
        yield_unit: "unit",
        target_gp: 35,
        selling_price: 120,
        status: "Approved",
        lines: [
          { line_type: "Ingredient", line_name: "Flour", quantity: 0.3, unit: "kg", unit_cost: 20, wastage_percent: 0 },
          { line_type: "Packaging", line_name: "Carton", quantity: 1, unit: "unit", unit_cost: 2, wastage_percent: 0 },
        ],
      }),
    }
  );
  if (!recipeCreate.data?.ok) throw new Error(`Create recipe failed: ${recipeCreate.data?.error || recipeCreate.status}`);
  const bomId = recipeCreate.data.recipe.id;

  const productCreate = await json(
    "/api/products",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        product_name: `SO Product ${stamp}`,
        product_category: "Finished Goods",
        linked_bom_id: bomId,
        selling_price: 120,
        total_cost: 70,
        target_gp: 35,
      }),
    }
  );
  if (!productCreate.data?.ok) throw new Error(`Create product failed: ${productCreate.data?.error || productCreate.status}`);
  const productId = productCreate.data.product.id;

  const stockCreate = await json(
    "/api/inventory/stock",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        action: "create",
        entityType: "finished_goods",
        entityId: productId,
        description: `SO Product ${stamp}`,
        itemCode: `SOFG-${stamp}`,
        currentCost: 70,
        openingQty: 50,
        openingDate: "2026-01-01",
        openingNote: "SO workflow opening stock",
      }),
    }
  );
  if (!stockCreate.data?.ok) throw new Error(`Create opening stock failed: ${stockCreate.data?.error || stockCreate.status}`);

  const orderCreate = await json(
    "/api/customer-sales-orders",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        customerId,
        customerName: normalised.name,
        deliveryAddress: "1 Test Street",
        contactName: "Accounts",
        salesperson: "Automation",
        warehouse: "Main",
        requestedDeliveryDate: "2026-07-10",
        notes: "Initial draft",
        lines: [
          {
            productId,
            description: `SO Product ${stamp}`,
            quantity: 5,
            unit: "unit",
            sellingPrice: 120,
            discountPct: 0,
            taxRate: 15,
            costPerUnit: 70,
          },
        ],
      }),
    }
  );
  if (!orderCreate.data?.ok) throw new Error(`Create sales order failed: ${orderCreate.data?.error || orderCreate.status}`);
  const orderId = orderCreate.data.order.id;

  const orderGetAfterCreate = await json(`/api/customer-sales-orders/${orderId}`, { headers: { Cookie: cookies } });
  if (!orderGetAfterCreate.data?.ok) throw new Error(`Reload created order failed: ${orderGetAfterCreate.data?.error || orderGetAfterCreate.status}`);

  const orderEdit = await json(
    "/api/customer-sales-orders",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        id: orderId,
        customerId,
        customerName: normalised.name,
        deliveryAddress: "2 Updated Street",
        contactName: "Accounts",
        salesperson: "Automation",
        warehouse: "Main",
        requestedDeliveryDate: "2026-07-11",
        notes: "Edited draft",
        lines: [
          {
            productId,
            description: `SO Product ${stamp}`,
            quantity: 6,
            unit: "unit",
            sellingPrice: 120,
            discountPct: 0,
            taxRate: 15,
            costPerUnit: 70,
          },
        ],
      }),
    }
  );
  if (!orderEdit.data?.ok) throw new Error(`Edit sales order failed: ${orderEdit.data?.error || orderEdit.status}`);

  const orderGetAfterEdit = await json(`/api/customer-sales-orders/${orderId}`, { headers: { Cookie: cookies } });
  if (!orderGetAfterEdit.data?.ok) throw new Error(`Reload edited order failed: ${orderGetAfterEdit.data?.error || orderGetAfterEdit.status}`);
  if (orderGetAfterEdit.data.order?.notes !== "Edited draft") {
    throw new Error("Edited order notes were not persisted");
  }

  const transitions = ["submit", "approve", "start_picking", "pack", "dispatch"];
  for (const action of transitions) {
    const transition = await json(
      `/api/customer-sales-orders/${orderId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ action, actor: "workflow-test" }),
      }
    );
    if (!transition.data?.ok) {
      const transitionError = String(transition.data?.error || "");
      const alreadyAtTarget = transitionError.includes("Invalid transition from Approved to Approved");
      if (!alreadyAtTarget) {
        throw new Error(`Transition ${action} failed: ${transition.data?.error || transition.status}`);
      }
    }
  }

  const convertInvoice = await json(
    `/api/customer-sales-orders/${orderId}/convert-invoice`,
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ actor: "workflow-test" }),
    }
  );
  if (!convertInvoice.data?.ok) {
    throw new Error(`Convert to invoice failed: ${convertInvoice.data?.error || convertInvoice.status}`);
  }

  const invoiceId = convertInvoice.data.invoice?.id;
  if (!invoiceId) throw new Error("Invoice ID missing after conversion");

  const duplicateConvert = await json(
    `/api/customer-sales-orders/${orderId}/convert-invoice`,
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ actor: "workflow-test" }),
    }
  );
  if (duplicateConvert.data?.ok) {
    throw new Error("Duplicate conversion unexpectedly succeeded");
  }

  const orderShortCreate = await json(
    "/api/customer-sales-orders",
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        customerId,
        customerName: normalised.name,
        deliveryAddress: "3 Short Street",
        contactName: "Ops",
        salesperson: "Automation",
        warehouse: "Main",
        requestedDeliveryDate: "2026-07-12",
        notes: "Shortage order",
        lines: [
          {
            productId,
            description: `SO Product ${stamp}`,
            quantity: 200,
            unit: "unit",
            sellingPrice: 120,
            discountPct: 0,
            taxRate: 15,
            costPerUnit: 70,
          },
        ],
      }),
    }
  );
  if (!orderShortCreate.data?.ok) throw new Error(`Create shortage order failed: ${orderShortCreate.data?.error || orderShortCreate.status}`);
  const shortageOrderId = orderShortCreate.data.order.id;

  const productionFromShortage = await json(
    `/api/customer-sales-orders/${shortageOrderId}/create-production-run`,
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ actor: "workflow-test" }),
    }
  );
  if (!productionFromShortage.data?.ok || !Array.isArray(productionFromShortage.data.runs) || !productionFromShortage.data.runs.length) {
    throw new Error(
      `Create production run failed: ${productionFromShortage.data?.error || productionFromShortage.status}`
    );
  }

  const requisitionFromShortage = await json(
    `/api/customer-sales-orders/${shortageOrderId}/generate-requisition`,
    {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ actor: "workflow-test" }),
    }
  );
  if (!requisitionFromShortage.data?.ok || !requisitionFromShortage.data.requisition?.id) {
    throw new Error(
      `Generate requisition failed: ${requisitionFromShortage.data?.error || requisitionFromShortage.status}`
    );
  }

  const { data: invoiceLinks } = await supabase
    .from("vyron_customer_sales_order_invoice_links")
    .select("sales_order_id, invoice_id")
    .eq("company_id", company.id)
    .eq("sales_order_id", orderId)
    .eq("invoice_id", invoiceId);

  const { data: productionLinks } = await supabase
    .from("vyron_customer_sales_order_production_links")
    .select("sales_order_id, production_run_id")
    .eq("company_id", company.id)
    .eq("sales_order_id", shortageOrderId);

  const { data: requisitionLinks } = await supabase
    .from("vyron_customer_sales_order_requisition_links")
    .select("sales_order_id, requisition_id")
    .eq("company_id", company.id)
    .eq("sales_order_id", shortageOrderId)
    .eq("requisition_id", requisitionFromShortage.data.requisition.id);

  if (!invoiceLinks?.length) throw new Error("Sales-order to invoice link missing");
  if (!productionLinks?.length) throw new Error("Sales-order to production-run link missing");
  if (!requisitionLinks?.length) throw new Error("Sales-order to requisition link missing");

  const finalOrder = await json(`/api/customer-sales-orders/${orderId}`, { headers: { Cookie: cookies } });
  if (!finalOrder.data?.ok) throw new Error(`Reload final order failed: ${finalOrder.data?.error || finalOrder.status}`);
  if (finalOrder.data.order?.status !== "Invoiced") {
    throw new Error(`Expected final order status Invoiced, got ${finalOrder.data.order?.status}`);
  }

  console.log("PASS customer_selector_mapping");
  console.log("PASS sales_order_create_reload_edit");
  console.log("PASS sales_order_workflow_submit_to_dispatch");
  console.log("PASS sales_order_convert_to_invoice");
  console.log("PASS sales_order_conversion_idempotency_guard");
  console.log("PASS sales_order_create_production_run");
  console.log("PASS sales_order_generate_requisition");
  console.log("PASS sales_order_traceability_links");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
