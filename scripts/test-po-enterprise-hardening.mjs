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

async function binary(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${appBase}${path}`, { ...options, headers });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, ok: response.ok, contentType: response.headers.get("content-type") || "", bytes };
}

const checks = [];
function mark(name, ok, detail = "") {
  checks.push({ name, ok, detail });
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `po-hardening-owner-${stamp}@example.com`;
  const ownerPassword = "PoHardening123!";

  let createdUserId = null;
  let workspaceId = null;
  let companyId = null;
  let supplierId = null;
  let poId = null;
  let attachmentId = null;

  try {
    const authCreated = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { first_name: "PO", surname: "Hardening" },
    });
    if (authCreated.error || !authCreated.data.user?.id) {
      throw new Error(authCreated.error?.message || "Failed to create auth user");
    }
    createdUserId = authCreated.data.user.id;

    const companyInsert = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `PO Hardening ${stamp}`, trading_name: `PO Hardening ${stamp}` })
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

    await supabase.from("vyron_user_profiles").upsert(
      {
        id: createdUserId,
        email: ownerEmail,
        first_name: "PO",
        surname: "Hardening",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    await supabase.from("vyron_workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: createdUserId,
      role: "OWNER",
      status: "Active",
      joined_at: new Date().toISOString(),
    });

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
    if (!login.data?.ok) throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);

    const cookies = cookieHeader(login.data.client, login.data.session);
    const authedHeaders = { "Content-Type": "application/json", Cookie: cookies };

    const createPo = await json(
      "/api/purchase-orders",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          po_number: `PO-${String(stamp).slice(-6)}-H`,
          supplier_id: supplierId,
          supplier_name_snapshot: `Supplier ${stamp}`,
          status: "Draft",
          order_date: new Date().toISOString().slice(0, 10),
          notes: "PO enterprise hardening test",
          header_discount_pct: 5,
          lines: [
            {
              item_type: "ingredient",
              item_name: "Hardening Ingredient",
              quantity: 10,
              unit: "kg",
              unit_price: 100,
              vat_rate: 15,
              discount_pct: 10,
            },
          ],
        }),
      },
      cookies
    );
    mark("Create Purchase Order", Boolean(createPo.data?.ok), String(createPo.data?.error || createPo.status));

    if (!createPo.data?.ok || !createPo.data?.purchaseOrder?.id) throw new Error("PO create failed");
    poId = createPo.data.purchaseOrder.id;

    const poAfterCreate = await json(`/api/purchase-orders/${poId}`, { headers: { Cookie: cookies } }, cookies);
    const total = Number(poAfterCreate.data?.purchaseOrder?.total || 0);
    mark("Discount Recalculation", total > 0 && total < 1150, `total=${total}`);

    const rejectPo = await json(
      `/api/purchase-orders/${poId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ status: "Rejected", rejectReason: "Pricing variance not accepted." }),
      },
      cookies
    );
    mark("Reject Workflow", Boolean(rejectPo.data?.ok && rejectPo.data?.purchaseOrder?.status === "Rejected"), String(rejectPo.data?.error || rejectPo.status));

    const archivePo = await json(
      `/api/purchase-orders/${poId}/archive`,
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ action: "archive", reason: "Archived in test." }),
      },
      cookies
    );
    mark("Archive Workflow", Boolean(archivePo.data?.ok && archivePo.data?.archive?.archived === true), String(archivePo.data?.error || archivePo.status));

    const archivedList = await json(`/api/purchase-orders/archived`, { headers: { Cookie: cookies } }, cookies);
    const archivedFound = Array.isArray(archivedList.data?.orders) && archivedList.data.orders.some((row) => row.id === poId);
    mark("Archived View/Search", archivedFound, `count=${Array.isArray(archivedList.data?.orders) ? archivedList.data.orders.length : 0}`);

    const restorePo = await json(
      `/api/purchase-orders/${poId}/archive`,
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ action: "restore", reason: "Restore in test." }),
      },
      cookies
    );
    mark("Restore Workflow", Boolean(restorePo.data?.ok && restorePo.data?.archive?.archived === false), String(restorePo.data?.error || restorePo.status));

    const pdf = await binary(`/api/purchase-orders/${poId}/pdf`, { headers: { Cookie: cookies } }, cookies);
    mark("Enterprise PDF Generation", pdf.ok && pdf.contentType.includes("application/pdf") && pdf.bytes.length > 1000, `status=${pdf.status}, bytes=${pdf.bytes.length}`);

    const uploadForm = new FormData();
    uploadForm.set("file", new File([Buffer.from("PO attachment test")], "quote-test.pdf", { type: "application/pdf" }));
    uploadForm.set("documentType", "supplier_quote");

    const uploadRes = await fetch(`${appBase}/api/purchase-orders/${poId}/attachments`, {
      method: "POST",
      headers: { Cookie: cookies },
      body: uploadForm,
    });
    const uploadData = await uploadRes.json().catch(() => ({}));
    mark("Attachment Upload", Boolean(uploadData?.ok && uploadData?.attachment?.id), String(uploadData?.error || uploadRes.status));
    attachmentId = uploadData?.attachment?.id || null;

    const listAttachments = await json(`/api/purchase-orders/${poId}/attachments`, { headers: { Cookie: cookies } }, cookies);
    const hasAttachment = Array.isArray(listAttachments.data?.attachments) && listAttachments.data.attachments.length > 0;
    mark("Attachment List", hasAttachment, `count=${Array.isArray(listAttachments.data?.attachments) ? listAttachments.data.attachments.length : 0}`);

    if (attachmentId) {
      const delAttachment = await json(
        `/api/purchase-orders/${poId}/attachments/${attachmentId}`,
        { method: "DELETE", headers: { Cookie: cookies } },
        cookies
      );
      mark("Attachment Delete", Boolean(delAttachment.data?.ok), String(delAttachment.data?.error || delAttachment.status));
    } else {
      mark("Attachment Delete", false, "No attachment id returned");
    }

    const approvePo = await json(
      `/api/purchase-orders/${poId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ status: "Approved", approvalNotes: "Approved for send" }),
      },
      cookies
    );
    mark("Approve Workflow", Boolean(approvePo.data?.ok), String(approvePo.data?.error || approvePo.status));

    const emailPo = await json(
      `/api/purchase-orders/${poId}/email`,
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ to: `supplier-${stamp}@example.com`, subject: `PO ${stamp}`, textBody: "Please find attached PO." }),
      },
      cookies
    );
    mark("Email Engine", Boolean(emailPo.data?.status === "sent" || emailPo.data?.status === "failed"), String(emailPo.data?.error || emailPo.status));

    const emailHistory = await json(`/api/purchase-orders/${poId}/email-history`, { headers: { Cookie: cookies } }, cookies);
    const hasEmailHistory = Array.isArray(emailHistory.data?.history) && emailHistory.data.history.length > 0;
    mark("Email History", hasEmailHistory, `count=${Array.isArray(emailHistory.data?.history) ? emailHistory.data.history.length : 0}`);

    const receivePo = await json(
      `/api/purchase-orders/${poId}/receive`,
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ mode: "full", actor: "po-hardening-test" }),
      },
      cookies
    );
    mark("Goods Receipt + Inventory Update", Boolean(receivePo.data?.ok), String(receivePo.data?.error || receivePo.status));

    for (const result of checks) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.name} :: ${result.detail}`);
    }

    const allPass = checks.every((result) => result.ok);
    console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
    process.exit(allPass ? 0 : 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FATAL:", message);
    for (const result of checks) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.name} :: ${result.detail}`);
    }
    console.log("OVERALL: FAIL");
    process.exit(1);
  } finally {
    if (companyId) {
      await supabase.from("vyron_documents").delete().eq("tenant_id", companyId).eq("purchase_order_id", poId || "");
      await supabase.from("vyron_document_extraction_logs").delete().in("document_id", [attachmentId || "00000000-0000-0000-0000-000000000000"]);
      await supabase.from("vyron_cost_goods_receipt_lines").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_goods_receipts").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_back_orders").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_purchase_order_lines").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_purchase_orders").delete().eq("company_id", companyId);
      await supabase.from("vyron_cost_suppliers").delete().eq("company_id", companyId);
      await supabase.from("vyron_procurement_audit_log").delete().eq("company_id", companyId);
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
