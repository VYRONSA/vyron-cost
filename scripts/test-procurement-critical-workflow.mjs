import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function json(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${appBase}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { _raw: raw.slice(0, 800) };
  }
  return { status: response.status, ok: response.ok, data };
}

const checks = new Map();
function mark(name, ok, detail) {
  checks.set(name, { ok, detail });
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `proc-owner-${stamp}@example.com`;
  const ownerPassword = "ProcureFlow123!";

  let createdUserId = null;
  let workspaceId = null;
  let companyId = null;
  let supplierId = null;
  let requisitionId = null;
  let requisitionPoId = null;
  let poId = null;

  try {
    const authCreated = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { first_name: "Proc", surname: "Owner" },
    });
    if (authCreated.error || !authCreated.data.user?.id) {
      throw new Error(authCreated.error?.message || "Failed to create auth user");
    }
    createdUserId = authCreated.data.user.id;

    const companyInsert = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `Proc Test ${stamp}`, trading_name: `Proc Test ${stamp}` })
      .select("id, name, trading_name")
      .single();
    if (companyInsert.error) throw companyInsert.error;
    companyId = companyInsert.data.id;

    const workspaceInsert = await supabase
      .from("vyron_workspaces")
      .insert({
        company_id: companyId,
        company_name: companyInsert.data.name,
        trading_name: companyInsert.data.trading_name,
        package_name: "Enterprise",
        status: "Live",
        user_limit: 20,
        owner_user_id: createdUserId,
        contact_email: ownerEmail,
      })
      .select("id")
      .single();
    if (workspaceInsert.error) throw workspaceInsert.error;
    workspaceId = workspaceInsert.data.id;

    const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
      {
        id: createdUserId,
        email: ownerEmail,
        first_name: "Proc",
        surname: "Owner",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (profileUpsert.error) throw profileUpsert.error;

    const membershipInsert = await supabase.from("vyron_workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: createdUserId,
      role: "OWNER",
      status: "Active",
      joined_at: new Date().toISOString(),
    });
    if (membershipInsert.error && !String(membershipInsert.error.message || "").includes("duplicate key")) {
      throw membershipInsert.error;
    }

    const supplierInsert = await supabase
      .from("vyron_cost_suppliers")
      .insert({
        company_id: companyId,
        supplier_name: `Supplier ${stamp}`,
        contact_email: `supplier-${stamp}@example.com`,
        invoice_email: `ap-${stamp}@example.com`,
        risk_status: "Active",
      })
      .select("id")
      .single();
    if (supplierInsert.error) throw supplierInsert.error;
    supplierId = supplierInsert.data.id;

    const login = await json("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    if (!login.data?.ok) {
      throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);
    }

    const cookies = cookieHeader(login.data.client, login.data.session);
    const authedHeaders = { "Content-Type": "application/json", Cookie: cookies };

    const loadReqs = await json("/api/procurement-requisitions", { headers: { Cookie: cookies } }, cookies);
    mark(
      "Procurement Requisition loads",
      Boolean(loadReqs.data?.ok),
      loadReqs.data?.error || loadReqs.status
    );

    const createReq = await json(
      "/api/procurement-requisitions",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          required_date: new Date().toISOString().slice(0, 10),
          notes: "Automated procurement workflow validation",
          created_by: ownerEmail,
          lines: [
            {
              ingredient_name: "Validation Ingredient",
              required_qty: 25,
              available_qty: 0,
              shortage_qty: 25,
              unit: "kg",
              estimated_cost: 1250,
              preferred_supplier_id: supplierId,
            },
          ],
        }),
      },
      cookies
    );
    const createReqOk = Boolean(createReq.data?.ok && createReq.data?.requisition?.id);
    mark("Create Procurement Requisition", createReqOk, createReq.data?.error || createReq.status);
    if (createReqOk) {
      requisitionId = createReq.data.requisition.id;

      await json(
        `/api/procurement-requisitions/${requisitionId}`,
        {
          method: "PATCH",
          headers: authedHeaders,
          body: JSON.stringify({ status: "Approved" }),
        },
        cookies
      );

      const genPo = await json(
        `/api/procurement-requisitions/${requisitionId}/generate-pos`,
        { method: "POST", headers: { Cookie: cookies } },
        cookies
      );
      if (genPo.data?.ok && Array.isArray(genPo.data.purchase_orders) && genPo.data.purchase_orders[0]?.id) {
        requisitionPoId = genPo.data.purchase_orders[0].id;
      }
    }

    const createPo = await json(
      "/api/purchase-orders",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          po_number: `PO-${String(stamp).slice(-6)}-A`,
          supplier_id: supplierId,
          supplier_name_snapshot: `Supplier ${stamp}`,
          status: "Draft",
          order_date: new Date().toISOString().slice(0, 10),
          notes: "Workflow validation PO",
          lines: [
            {
              item_type: "ingredient",
              item_name: "Validation Ingredient",
              quantity: 10,
              unit: "kg",
              unit_price: 42,
              vat_rate: 15,
            },
          ],
        }),
      },
      cookies
    );
    const createPoOk = Boolean(createPo.data?.ok && createPo.data?.purchaseOrder?.id);
    mark("Create Purchase Order", createPoOk, createPo.data?.error || createPo.status);
    if (!createPoOk) {
      mark("Purchase Order screen loads", false, "Create Purchase Order failed, no PO id available.");
      mark("Save Purchase Order", false, "Create Purchase Order failed, cannot update PO.");
      mark("Print Purchase Order", false, "Create Purchase Order failed, cannot open PO detail.");
    } else {
      poId = createPo.data.purchaseOrder.id;

      const poScreenTarget = requisitionPoId || poId;
      const poScreen = await fetch(`${appBase}/purchase-orders/${poScreenTarget}`, { headers: { Cookie: cookies } });
      const poHtml = await poScreen.text();
      const poScreenOk = poScreen.ok && poHtml.toLowerCase().includes("purchase order");
      mark("Purchase Order screen loads", poScreenOk, `status=${poScreen.status}`);

      const savePo = await json(
        `/api/purchase-orders/${poId}`,
        {
          method: "PUT",
          headers: authedHeaders,
          body: JSON.stringify({
            id: poId,
            po_number: `PO-${String(stamp).slice(-6)}-A`,
            supplier_id: supplierId,
            supplier_name_snapshot: `Supplier ${stamp}`,
            status: "Submitted",
            order_date: new Date().toISOString().slice(0, 10),
            notes: "Workflow validation PO - updated",
            lines: [
              {
                item_type: "ingredient",
                item_name: "Validation Ingredient",
                quantity: 12,
                unit: "kg",
                unit_price: 42,
                vat_rate: 15,
              },
            ],
          }),
        },
        cookies
      );
      mark("Save Purchase Order", Boolean(savePo.data?.ok), savePo.data?.error || savePo.status);

      const printPage = await fetch(`${appBase}/purchase-orders/${poScreenTarget}`, { headers: { Cookie: cookies } });
      const printHtml = await printPage.text();
      const printOk = printPage.ok && printHtml.includes("Print PDF");
      mark("Print Purchase Order", printOk, printOk ? "Print control rendered." : `status=${printPage.status}`);
    }

    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail ?? ""}`);
    }

    const allPass = Array.from(checks.values()).every((result) => result.ok);
    console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
    process.exit(allPass ? 0 : 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FATAL:", message);
    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail ?? ""}`);
    }
    console.log("OVERALL: FAIL");
    process.exit(1);
  } finally {
    if (companyId) {
      await supabase.from("vyron_cost_goods_receipt_lines").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_goods_receipts").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_back_orders").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_purchase_order_lines").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_purchase_orders").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_procurement_requisition_lines").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_procurement_requisitions").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_suppliers").delete().eq("company_id", companyId);
    }

    if (workspaceId) {
      await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId);
      await supabase.from("vyron_workspaces").delete().eq("id", workspaceId);
    }

    if (companyId) {
      await supabase.from("vyron_cost_companies").delete().eq("id", companyId);
    }

    if (createdUserId) {
      await supabase.from("vyron_user_profiles").delete().eq("id", createdUserId);
      await supabase.auth.admin.deleteUser(createdUserId);
    }
  }
}

main();
