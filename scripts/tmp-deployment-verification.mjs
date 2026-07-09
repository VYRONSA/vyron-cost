import { readFileSync } from "fs";
import { randomUUID } from "crypto";
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
  console.error("FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const report = [];
function add(stage, status, detail) {
  report.push({ stage, status, detail: String(detail || "") });
}

function cookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function json(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { _raw: raw.slice(0, 800) };
  }
  return { status: response.status, ok: response.ok, data };
}

async function ensureColumns(table, columns) {
  const missing = [];
  for (const col of columns) {
    const { error } = await supabase.from(table).select(col).limit(1);
    if (error) missing.push({ col, code: error.code, message: error.message });
  }
  return missing;
}

async function main() {
  const stamp = Date.now();
  let userId = null;
  let companyId = null;
  let workspaceId = null;
  let cookies = "";

  let customerId = null;
  let productId = null;
  let stockItemId = null;
  let invoiceId = null;

  try {
    add(
      "Migration Apply (Ordered)",
      "Runtime Validation Required",
      "No SQL execution channel available in this environment (no supabase CLI/psql and no exposed SQL RPC)."
    );
    add(
      "PostgREST Cache Reload",
      "Runtime Validation Required",
      "Cannot execute NOTIFY pgrst without SQL execution channel."
    );

    const auth = await supabase.auth.admin.createUser({
      email: `deploy-verify-${stamp}@example.com`,
      password: "DeployVerify123!",
      email_confirm: true,
      user_metadata: { first_name: "Deploy", surname: "Verifier" },
    });
    if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "Auth user create failed");
    userId = auth.data.user.id;

    const companyInsert = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `Deploy Verify ${stamp}`, trading_name: `Deploy Verify ${stamp}` })
      .select("id,name,trading_name")
      .single();
    if (companyInsert.error) throw companyInsert.error;
    companyId = companyInsert.data.id;

    const workspaceInsert = await supabase
      .from("vyron_workspaces")
      .insert({
        company_id: companyId,
        company_name: companyInsert.data.name,
        trading_name: companyInsert.data.trading_name,
        package_name: "Professional",
        status: "Live",
        user_limit: 5,
        owner_user_id: userId,
        contact_email: `deploy-verify-${stamp}@example.com`,
      })
      .select("id")
      .single();
    if (workspaceInsert.error) throw workspaceInsert.error;
    workspaceId = workspaceInsert.data.id;

    const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
      {
        id: userId,
        email: `deploy-verify-${stamp}@example.com`,
        first_name: "Deploy",
        surname: "Verifier",
        status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (profileUpsert.error) throw profileUpsert.error;

    const membershipInsert = await supabase.from("vyron_workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: userId,
      role: "OWNER",
      status: "Active",
      joined_at: new Date().toISOString(),
    });
    if (membershipInsert.error && !String(membershipInsert.error.message || "").includes("duplicate key")) {
      throw membershipInsert.error;
    }

    const login = await json("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `deploy-verify-${stamp}@example.com`, password: "DeployVerify123!" }),
    });
    if (!login.data?.ok) throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);
    cookies = cookieHeader(login.data.client, login.data.session);

    const dbMissingObjects = [];

    const auditProbe = await supabase.from("vyron_inventory_audit_log").select("id").limit(1);
    if (auditProbe.error) dbMissingObjects.push(`table public.vyron_inventory_audit_log (${auditProbe.error.code || ""} ${auditProbe.error.message || ""})`);

    const skuProbe = await supabase.from("vyron_cost_products").select("sku").limit(1);
    if (skuProbe.error) dbMissingObjects.push(`column public.vyron_cost_products.sku (${skuProbe.error.code || ""} ${skuProbe.error.message || ""})`);

    const stockCountHeaderCols = await ensureColumns("vyron_cost_stock_counts", [
      "approved_by",
      "approved_at",
      "submitted_at",
      "posted_at",
    ]);
    for (const m of stockCountHeaderCols) dbMissingObjects.push(`column public.vyron_cost_stock_counts.${m.col} (${m.code || ""} ${m.message || ""})`);

    const stockCountLineCols = await ensureColumns("vyron_cost_stock_count_lines", [
      "company_id",
      "variance_class",
      "approved",
      "updated_at",
    ]);
    for (const m of stockCountLineCols) dbMissingObjects.push(`column public.vyron_cost_stock_count_lines.${m.col} (${m.code || ""} ${m.message || ""})`);

    const auditCols = await ensureColumns("vyron_inventory_audit_log", [
      "company_id",
      "stock_item_id",
      "event_type",
      "actor",
      "field_name",
      "old_value",
      "new_value",
      "detail",
      "reference_type",
      "reference_id",
      "metadata",
      "created_at",
    ]);
    for (const m of auditCols) dbMissingObjects.push(`column public.vyron_inventory_audit_log.${m.col} (${m.code || ""} ${m.message || ""})`);

    if (dbMissingObjects.length) {
      add("Database Verification", "FAIL", `Missing schema object(s): ${dbMissingObjects.join(" | ")}`);
      for (const row of report) console.log(`${row.stage}: ${row.status} :: ${row.detail}`);
      return;
    }

    const headers = { "Content-Type": "application/json", Cookie: cookies };

    const ingredientRes = await json(
      "/api/ingredients",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ingredient_name: `Deploy Ingredient ${stamp}`,
          category: "Raw Materials",
          purchase_unit: "kg",
          recipe_unit: "kg",
          purchase_cost: 20,
          yield_percent: 100,
        }),
      },
      cookies
    );
    if (!ingredientRes.data?.ok) throw new Error(`Ingredient create failed: ${ingredientRes.data?.error || ingredientRes.status}`);
    const ingredientId = ingredientRes.data.ingredient.id;

    const stockCreate = await json(
      "/api/inventory/stock",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          entityType: "ingredient",
          entityId: ingredientId,
          description: `Deploy Ingredient ${stamp}`,
          itemCode: `DING-${stamp}`,
          unit: "kg",
          currentCost: 20,
          openingQty: 50,
          openingDate: "2026-01-01",
          openingNote: "deployment verification",
        }),
      },
      cookies
    );
    if (!stockCreate.data?.ok) throw new Error(`Stock create failed: ${stockCreate.data?.error || stockCreate.status}`);
    stockItemId = stockCreate.data.item.id;

    const productRes = await json(
      "/api/products",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_name: `Deploy Product ${stamp}`,
          product_category: "Finished Goods",
          selling_price: 30,
          total_cost: 15,
          target_gp: 30,
          product_status: "Active",
          sku: `DSKU-${stamp}`,
        }),
      },
      cookies
    );
    if (!productRes.data?.ok) throw new Error(`Product create failed: ${productRes.data?.error || productRes.status}`);
    productId = productRes.data.product.id;

    const fgStockCreate = await json(
      "/api/inventory/stock",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          entityType: "finished_goods",
          entityId: productId,
          description: `Deploy Product ${stamp}`,
          itemCode: `DFG-${stamp}`,
          unit: "unit",
          currentCost: 15,
          openingQty: 40,
          openingDate: "2026-01-01",
          openingNote: "deployment verification",
        }),
      },
      cookies
    );
    if (!fgStockCreate.data?.ok) throw new Error(`FG stock create failed: ${fgStockCreate.data?.error || fgStockCreate.status}`);

    const customerRes = await json(
      "/api/customers",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerName: `Deploy Customer ${stamp}`,
          category: "General",
          terms: "30 Days",
          status: "Active",
        }),
      },
      cookies
    );
    if (!customerRes.data?.ok) throw new Error(`Customer create failed: ${customerRes.data?.error || customerRes.status}`);
    customerId = customerRes.data.customer.id;

    const invoiceRes = await json(
      "/api/customer-invoices",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId,
          customerName: `Deploy Customer ${stamp}`,
          lines: [
            {
              productId,
              productName: `Deploy Product ${stamp}`,
              quantity: 2,
              sellingPrice: 30,
              costPerUnit: 15,
            },
          ],
        }),
      },
      cookies
    );
    if (!invoiceRes.data?.ok) throw new Error(`Invoice create failed: ${invoiceRes.data?.error || invoiceRes.status}`);
    invoiceId = invoiceRes.data.invoice.id;

    const lineProbe = await supabase
      .from("vyron_customer_invoice_lines")
      .select("id, product_id")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (lineProbe.error || !lineProbe.data?.id) throw new Error(lineProbe.error?.message || "Invoice line lookup failed");

    const invalidProductFk = await supabase
      .from("vyron_customer_invoice_lines")
      .update({ product_id: randomUUID() })
      .eq("id", lineProbe.data.id);

    const fkInvoiceProductPass = Boolean(
      invalidProductFk.error &&
      String(invalidProductFk.error.message || "").toLowerCase().includes("foreign key")
    );

    const invalidAuditCompany = await supabase.from("vyron_inventory_audit_log").insert({
      company_id: randomUUID(),
      stock_item_id: null,
      event_type: "Deploy FK probe",
      actor: "verifier",
      detail: "fk probe",
      reference_type: "probe",
      reference_id: randomUUID(),
    });
    const fkAuditCompanyPass = Boolean(
      invalidAuditCompany.error &&
      String(invalidAuditCompany.error.message || "").toLowerCase().includes("foreign key")
    );

    const invalidAuditStock = await supabase.from("vyron_inventory_audit_log").insert({
      company_id: companyId,
      stock_item_id: randomUUID(),
      event_type: "Deploy FK probe",
      actor: "verifier",
      detail: "fk probe",
      reference_type: "probe",
      reference_id: randomUUID(),
    });
    const fkAuditStockPass = Boolean(
      invalidAuditStock.error &&
      String(invalidAuditStock.error.message || "").toLowerCase().includes("foreign key")
    );

    const countCreate = await json(
      "/api/inventory/counts",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ countType: "ingredients", notes: "deployment verification count" }),
      },
      cookies
    );
    if (!countCreate.data?.ok || !countCreate.data?.count?.id) throw new Error(`Count create failed: ${countCreate.data?.error || countCreate.status}`);
    const countId = countCreate.data.count.id;

    const countOpen = await json(`/api/inventory/counts/${countId}`, { headers: { Cookie: cookies } }, cookies);
    if (!countOpen.data?.ok || !Array.isArray(countOpen.data.lines) || countOpen.data.lines.length === 0) {
      throw new Error(`Count open failed: ${countOpen.data?.error || countOpen.status}`);
    }
    const targetLine = countOpen.data.lines.find((line) => String(line.stock_item_id) === String(stockItemId)) || countOpen.data.lines[0];

    const invalidLineCompany = await supabase
      .from("vyron_cost_stock_count_lines")
      .update({ company_id: randomUUID() })
      .eq("id", targetLine.id);
    const fkLineCompanyPass = Boolean(
      invalidLineCompany.error &&
      String(invalidLineCompany.error.message || "").toLowerCase().includes("foreign key")
    );

    const invalidLineStock = await supabase
      .from("vyron_cost_stock_count_lines")
      .update({ stock_item_id: randomUUID() })
      .eq("id", targetLine.id);
    const fkLineStockPass = Boolean(
      invalidLineStock.error &&
      String(invalidLineStock.error.message || "").toLowerCase().includes("foreign key")
    );

    const fkFailures = [];
    if (!fkInvoiceProductPass) fkFailures.push("vyron_customer_invoice_lines.product_id -> vyron_cost_products(id)");
    if (!fkAuditCompanyPass) fkFailures.push("vyron_inventory_audit_log.company_id -> vyron_cost_companies(id)");
    if (!fkAuditStockPass) fkFailures.push("vyron_inventory_audit_log.stock_item_id -> vyron_cost_stock_items(id)");
    if (!fkLineCompanyPass) fkFailures.push("vyron_cost_stock_count_lines.company_id -> vyron_cost_companies(id)");
    if (!fkLineStockPass) fkFailures.push("vyron_cost_stock_count_lines.stock_item_id -> vyron_cost_stock_items(id)");

    if (fkFailures.length) {
      add("Database Verification", "FAIL", `Missing/unenforced FK(s): ${fkFailures.join(" | ")}`);
      for (const row of report) console.log(`${row.stage}: ${row.status} :: ${row.detail}`);
      return;
    }

    add(
      "Database Verification",
      "Runtime Validation Required",
      "Columns/tables/FKs validated. Indexes could not be proven because pg_catalog/information_schema is not exposed via PostgREST in this environment."
    );

    const updateLine = await json(
      `/api/inventory/counts/${countId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "updateLine", lineId: targetLine.id, countedQty: Number(targetLine.system_qty || 0) + 5 }),
      },
      cookies
    );

    const saveLine = await json(
      `/api/inventory/counts/${countId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "updateLine", lineId: targetLine.id, countedQty: Number(targetLine.system_qty || 0) + 5 }),
      },
      cookies
    );

    const pause = await json(
      `/api/inventory/counts/${countId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action: "pause", actor: "deploy-verifier" }) },
      cookies
    );
    const resume = await json(
      `/api/inventory/counts/${countId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action: "resume", actor: "deploy-verifier" }) },
      cookies
    );

    const submit = await json(
      `/api/inventory/counts/${countId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action: "submit" }) },
      cookies
    );
    const approve = await json(
      `/api/inventory/counts/${countId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action: "approve", approvedBy: "deploy-verifier" }) },
      cookies
    );
    const post = await json(
      `/api/inventory/counts/${countId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action: "post", actor: "deploy-verifier" }) },
      cookies
    );

    const postedCount = await json(`/api/inventory/counts/${countId}`, { headers: { Cookie: cookies } }, cookies);

    const varianceLedger = await supabase
      .from("vyron_cost_stock_ledger")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_id", countId)
      .eq("movement_type", "Stock Count Variance")
      .limit(1);

    const countAudit = await supabase
      .from("vyron_inventory_audit_log")
      .select("event_type, reference_id")
      .eq("company_id", companyId)
      .eq("reference_id", countId);

    const hasCountCreated = (countAudit.data || []).some((r) => String(r.event_type || "").toLowerCase().includes("stock count created"));
    const hasCountPosted = (countAudit.data || []).some((r) => String(r.event_type || "").toLowerCase().includes("stock count posted"));

    const countPass = Boolean(
      countCreate.data?.ok &&
      countOpen.data?.ok &&
      updateLine.data?.ok &&
      saveLine.data?.ok &&
      pause.data?.ok &&
      resume.data?.ok &&
      submit.data?.ok &&
      approve.data?.ok &&
      post.data?.ok &&
      postedCount.data?.count?.status === "Posted" &&
      !varianceLedger.error &&
      (varianceLedger.data || []).length > 0 &&
      hasCountCreated &&
      hasCountPosted
    );

    if (countPass) {
      add("Runtime: Inventory Count", "PASS", "Create/Open/Capture/Save/Re-open/Approve/Post and ledger+audit verification passed.");
    } else {
      add(
        "Runtime: Inventory Count",
        "FAIL",
        JSON.stringify({
          create: countCreate.status,
          open: countOpen.status,
          update: updateLine.status,
          save: saveLine.status,
          pause: pause.status,
          resume: resume.status,
          submit: submit.status,
          approve: approve.status,
          post: post.status,
          status: postedCount.data?.count?.status,
          varianceLedgerError: varianceLedger.error?.message || null,
          varianceLedgerRows: varianceLedger.data?.length || 0,
          hasCountCreated,
          hasCountPosted,
        })
      );
    }

    const beforeAdjust = await supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand")
      .eq("id", stockItemId)
      .single();
    const adjust = await json(
      "/api/inventory-transactions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "adjust",
          stock_item_id: stockItemId,
          quantity_delta: 3,
          unit_cost: 20,
          notes: "deployment verification adjustment",
          created_by: "deploy-verifier",
        }),
      },
      cookies
    );
    const afterAdjust = await supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand")
      .eq("id", stockItemId)
      .single();

    const adjustmentAudit = await supabase
      .from("vyron_inventory_audit_log")
      .select("id,event_type")
      .eq("company_id", companyId)
      .ilike("event_type", "%adjust%")
      .order("created_at", { ascending: false })
      .limit(1);

    const qtyDelta = Number(afterAdjust.data?.qty_on_hand || 0) - Number(beforeAdjust.data?.qty_on_hand || 0);
    const adjustmentPass = Boolean(adjust.data?.ok && qtyDelta === 3 && (adjustmentAudit.data || []).length > 0);

    if (adjustmentPass) {
      add("Runtime: Inventory Adjustment", "PASS", "Adjustment posted, stock quantity changed, and audit entry found.");
    } else {
      add(
        "Runtime: Inventory Adjustment",
        "FAIL",
        JSON.stringify({
          adjustStatus: adjust.status,
          adjustOk: adjust.data?.ok || false,
          qtyBefore: Number(beforeAdjust.data?.qty_on_hand || 0),
          qtyAfter: Number(afterAdjust.data?.qty_on_hand || 0),
          qtyDelta,
          auditRows: adjustmentAudit.data?.length || 0,
        })
      );
    }

    const postStock = await json(
      `/api/customer-invoices/${invoiceId}/post-stock`,
      { method: "POST", headers, body: JSON.stringify({}) },
      cookies
    );

    const fgStockItem = await supabase
      .from("vyron_cost_stock_items")
      .select("id, qty_on_hand")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", productId)
      .single();

    const customerBalance = await supabase
      .from("vyron_customers")
      .select("outstanding_invoices")
      .eq("id", customerId)
      .single();

    const statement = await json(`/api/customer-statements?customerId=${encodeURIComponent(customerId)}`, { headers: { Cookie: cookies } }, cookies);

    const invoiceSales = Number(invoiceRes.data?.invoice?.sales_value || 0);
    const statementOutstanding = Number(statement.data?.statement?.outstanding || 0);
    const customerOutstanding = Number(customerBalance.data?.outstanding_invoices || 0);

    const invoicePass = Boolean(
      postStock.data?.ok &&
      Number(fgStockItem.data?.qty_on_hand || 0) === 38 &&
      statement.data?.ok &&
      statementOutstanding >= invoiceSales &&
      customerOutstanding >= invoiceSales
    );

    if (invoicePass) {
      add("Runtime: Customer Invoice", "PASS", "Create/Save/Post with stock reduction and customer outstanding updates verified.");
    } else {
      add(
        "Runtime: Customer Invoice",
        "FAIL",
        JSON.stringify({
          postStatus: postStock.status,
          postOk: postStock.data?.ok || false,
          fgQty: Number(fgStockItem.data?.qty_on_hand || 0),
          invoiceSales,
          customerOutstanding,
          statementOutstanding,
          statementOk: statement.data?.ok || false,
        })
      );
    }
  } catch (error) {
    add("Execution", "FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    try {
      if (invoiceId) {
        await supabase.from("vyron_customer_invoice_lines").delete().eq("invoice_id", invoiceId);
        await supabase.from("vyron_customer_invoices").delete().eq("id", invoiceId);
      }
    } catch {}
    try {
      if (workspaceId) await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspaceId);
      if (workspaceId) await supabase.from("vyron_workspaces").delete().eq("id", workspaceId);
    } catch {}
    try {
      if (companyId) await supabase.from("vyron_cost_companies").delete().eq("id", companyId);
    } catch {}
    try {
      if (userId) {
        await supabase.from("vyron_user_profiles").delete().eq("id", userId);
        await supabase.auth.admin.deleteUser(userId);
      }
    } catch {}
  }

  for (const row of report) {
    console.log(`${row.stage}: ${row.status} :: ${row.detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
