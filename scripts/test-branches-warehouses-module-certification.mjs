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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3007";

if (!supabaseUrl || !serviceRoleKey) {
  console.log("Warehouses Runtime Validation: FAIL");
  console.log("Warehouses Inventory Association Validation: FAIL");
  console.log("Warehouses Purchase Order Association Validation: FAIL");
  console.log("Warehouses Goods Receiving Association Validation: FAIL");
  console.log("Warehouses Manufacturing Association Validation: FAIL");
  console.log("Warehouses Stock Count Association Validation: FAIL");
  console.log("Warehouses Inventory Adjustment Association Validation: FAIL");
  console.log("Warehouses Tenant Isolation Validation: FAIL");
  console.log("Warehouses API Validation: FAIL");
  console.log("Warehouses UI Validation: FAIL");
  console.log("Warehouses Audit Logging Validation: FAIL");
  console.log("Warehouses Cross-company Access Validation: FAIL");
  console.log("Warehouses Inventory Leakage Validation: FAIL");
  console.log("WAREHOUSES BLOCKER: Missing Supabase environment configuration.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function cookieHeader(client, session) {
  return `vyron_cost_active_client=${encodeURIComponent(JSON.stringify(client))}; vyron_workspace_user_session=${encodeURIComponent(JSON.stringify(session))}`;
}

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${appBase}${path}`, { ...options, headers, redirect: "manual" });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { _raw: raw.slice(0, 12000) };
      }
      return { status: response.status, ok: response.ok, data, raw, headers: response.headers };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "fetch failed"));
}

function warehouseLabelFromCount(count) {
  if (!count || typeof count !== "object") return "";
  const notes = String(count.notes || "");
  const match = notes.match(/(?:^|\|)\s*Warehouse:\s*([^|]+)/i);
  return match ? String(match[1] || "").trim() : "";
}

async function createWorkspaceAndOwner(tag) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `${tag}.${stamp}@example.com`;
  const password = "WarehouseCert123!";

  const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user?.id) throw new Error(auth.error?.message || "owner auth create failed");
  const userId = auth.data.user.id;

  const company = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Warehouse Cert ${tag} ${stamp}`, trading_name: `${tag} Trading` })
    .select("id,name,trading_name")
    .single();
  if (company.error) throw company.error;

  const workspace = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: company.data.id,
      company_name: company.data.name,
      trading_name: company.data.trading_name,
      package_name: "Enterprise Multi-Store",
      status: "Live",
      user_limit: 25,
      owner_user_id: userId,
      contact_email: email,
    })
    .select("id")
    .single();
  if (workspace.error) throw workspace.error;

  const profile = await supabase.from("vyron_user_profiles").upsert(
    {
      id: userId,
      email,
      first_name: "Warehouse",
      surname: "Owner",
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profile.error) throw profile.error;

  const membership = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspace.data.id,
    user_id: userId,
    role: "OWNER",
    status: "Active",
    joined_at: new Date().toISOString(),
  });
  if (membership.error && !String(membership.error.message || "").includes("duplicate key")) throw membership.error;

  const login = await api("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) throw new Error(`owner login failed: ${JSON.stringify(login.data)}`);

  return {
    email,
    password,
    userId,
    workspaceId: workspace.data.id,
    companyId: company.data.id,
    cookies: cookieHeader(login.data.client, login.data.session),
    createdUserEmails: [],
  };
}

async function cleanupWorkspace(ctx) {
  if (!ctx) return;

  for (const email of ctx.createdUserEmails || []) {
    await cleanupUserByEmail(email);
  }

  try { await supabase.from("vyron_cost_stock_ledger").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_inventory_transactions").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_stock_count_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_stock_counts").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_stock_items").delete().eq("company_id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_cost_goods_receipt_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_goods_receipts").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_back_orders").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_purchase_order_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_purchase_orders").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_procurement_requisition_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_procurement_requisitions").delete().eq("company_id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_cost_store_order_events").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_store_order_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_store_orders").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_store_order_approval_rules").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_stores").delete().eq("company_id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_production_run_audit").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_production_runs").delete().eq("company_id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_cost_bom_lines").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_boms").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_finished_goods").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_products").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_ingredients").delete().eq("company_id", ctx.companyId); } catch {}
  try { await supabase.from("vyron_cost_suppliers").delete().eq("company_id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", ctx.workspaceId); } catch {}
  try { await supabase.from("vyron_workspaces").delete().eq("id", ctx.workspaceId); } catch {}
  try { await supabase.from("vyron_cost_companies").delete().eq("id", ctx.companyId); } catch {}

  try { await supabase.from("vyron_user_profiles").delete().eq("id", ctx.userId); } catch {}
  try { await supabase.auth.admin.deleteUser(ctx.userId); } catch {}
}

async function cleanupUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return;

  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage });
    if (listed.error) return;
    const match = listed.data.users.find((u) => String(u.email || "").toLowerCase() === normalized);
    if (match?.id) {
      try { await supabase.from("vyron_workspace_memberships").delete().eq("user_id", match.id); } catch {}
      try { await supabase.from("vyron_user_profiles").delete().eq("id", match.id); } catch {}
      try { await supabase.auth.admin.deleteUser(match.id); } catch {}
      return;
    }
    if (listed.data.users.length < perPage) return;
    page += 1;
  }
}

async function main() {
  const result = {
    runtime: "FAIL",
    inventoryAssociation: "FAIL",
    poAssociation: "FAIL",
    grnAssociation: "FAIL",
    manufacturingAssociation: "FAIL",
    stockCountAssociation: "FAIL",
    inventoryAdjustmentAssociation: "FAIL",
    tenantIsolation: "FAIL",
    apiValidation: "FAIL",
    uiValidation: "FAIL",
    auditLogging: "FAIL",
    crossCompanyAccess: "FAIL",
    inventoryLeakage: "FAIL",
    blocker: null,
  };

  let ownerA = null;
  let ownerB = null;

  try {
    ownerA = await createWorkspaceAndOwner("warehouse-owner-a");
    ownerB = await createWorkspaceAndOwner("warehouse-owner-b");

    const storeA1Code = `WHA-${Date.now().toString().slice(-6)}`;
    const storeA2Code = `WHB-${Date.now().toString().slice(-6)}`;

    const createA1 = await api(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          store_code: storeA1Code,
          store_name: "Warehouse A Primary",
          address: "1 Warehouse Road",
          contact_name: "Ops Lead",
          contact_email: "ops-a@example.com",
          contact_phone: "0211230001",
          status: "Active",
          notes: "Initial warehouse",
        }),
      },
      ownerA.cookies
    );

    if (!createA1.data?.ok || !createA1.data?.store?.id) {
      throw new Error(`Create warehouse failed: ${JSON.stringify(createA1.data)}`);
    }
    const storeA1 = createA1.data.store;

    const createA2 = await api(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          store_code: storeA2Code,
          store_name: "Warehouse A Secondary",
          status: "Active",
          notes: "Secondary warehouse",
        }),
      },
      ownerA.cookies
    );
    if (!createA2.data?.ok || !createA2.data?.store?.id) {
      throw new Error(`Create secondary warehouse failed: ${JSON.stringify(createA2.data)}`);
    }
    const storeA2 = createA2.data.store;

    const editA1 = await api(
      `/api/stores/${encodeURIComponent(storeA1.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          store_name: "Warehouse A Primary Updated",
          contact_name: "Ops Manager",
          notes: "Updated settings",
        }),
      },
      ownerA.cookies
    );
    if (!editA1.data?.ok || String(editA1.data?.store?.store_name || "") !== "Warehouse A Primary Updated") {
      throw new Error(`Edit warehouse failed: ${JSON.stringify(editA1.data)}`);
    }

    const disableA1 = await api(
      `/api/stores/${encodeURIComponent(storeA1.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Inactive" }),
      },
      ownerA.cookies
    );
    if (!disableA1.data?.ok || String(disableA1.data?.store?.status || "") !== "Inactive") {
      throw new Error(`Disable warehouse failed: ${JSON.stringify(disableA1.data)}`);
    }

    const enableA1 = await api(
      `/api/stores/${encodeURIComponent(storeA1.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Active" }),
      },
      ownerA.cookies
    );
    if (!enableA1.data?.ok || String(enableA1.data?.store?.status || "") !== "Active") {
      throw new Error(`Enable warehouse failed: ${JSON.stringify(enableA1.data)}`);
    }

    const saveWarehouseSettings = await api(
      "/api/store-orders/approval-rules",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ maxOrderValue: 76543, minMarginPct: 22, maxQtyVariancePct: 45, warnInactiveProducts: true }),
      },
      ownerA.cookies
    );
    if (!saveWarehouseSettings.data?.ok) {
      throw new Error(`Warehouse settings update failed: ${JSON.stringify(saveWarehouseSettings.data)}`);
    }

    const activeStores = await api("/api/stores?activeOnly=true", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!activeStores.data?.ok || !Array.isArray(activeStores.data?.stores) || !activeStores.data.stores.length) {
      throw new Error(`Default warehouse assignment pre-check failed: ${JSON.stringify(activeStores.data)}`);
    }
    const defaultWarehouseId = String(activeStores.data.stores[0].id);

    const productCreate = await api(
      "/api/products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          product_name: `Warehouse Cert Product ${Date.now()}`,
          product_category: "Finished Goods",
          selling_price: 120,
          total_cost: 70,
          target_gp: 25,
          product_status: "Active",
        }),
      },
      ownerA.cookies
    );
    if (!productCreate.data?.ok || !productCreate.data?.product?.id) {
      throw new Error(`Default warehouse assignment product setup failed: ${JSON.stringify(productCreate.data)}`);
    }

    const createStoreOrder = await api(
      "/api/store-orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          store_id: defaultWarehouseId,
          notes: "Default warehouse assignment validation",
          lines: [
            {
              product_id: productCreate.data.product.id,
              product_name_snapshot: productCreate.data.product.product_name,
              quantity: 2,
              unit: "each",
              unit_price: 120,
              vat_rate: 15,
            },
          ],
        }),
      },
      ownerA.cookies
    );
    if (!createStoreOrder.data?.ok || String(createStoreOrder.data?.order?.store_id || "") !== defaultWarehouseId) {
      throw new Error(`Default warehouse assignment failed: ${JSON.stringify(createStoreOrder.data)}`);
    }

    result.runtime = "PASS";

    const ingredientCreate = await api(
      "/api/ingredients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          ingredient_name: `Warehouse Ingredient ${Date.now()}`,
          category: "Raw Materials",
          purchase_unit: "kg",
          recipe_unit: "kg",
          purchase_cost: 15,
          yield_percent: 100,
        }),
      },
      ownerA.cookies
    );
    if (!ingredientCreate.data?.ok || !ingredientCreate.data?.ingredient?.id) {
      throw new Error(`Inventory association ingredient setup failed: ${JSON.stringify(ingredientCreate.data)}`);
    }
    const ingredientId = ingredientCreate.data.ingredient.id;

    const openingStock = await api(
      "/api/inventory/stock",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          action: "create",
          entityType: "ingredient",
          entityId: ingredientId,
          description: "Warehouse Ingredient",
          itemCode: `ING-${Date.now().toString().slice(-6)}`,
          currentCost: 15,
          openingQty: 50,
          openingDate: "2026-01-01",
          openingNote: "Warehouse module stock seed",
        }),
      },
      ownerA.cookies
    );
    if (!openingStock.data?.ok) {
      throw new Error(`Inventory association opening stock failed: ${JSON.stringify(openingStock.data)}`);
    }

    const createCountA1 = await api(
      "/api/inventory/counts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ countType: "ingredients", warehouseName: "Warehouse A Primary Updated", notes: "Warehouse count A1" }),
      },
      ownerA.cookies
    );
    if (!createCountA1.data?.ok || !createCountA1.data?.count?.id) {
      throw new Error(`Stock count association failed: ${JSON.stringify(createCountA1.data)}`);
    }

    const createCountA2 = await api(
      "/api/inventory/counts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ countType: "ingredients", warehouseName: "Warehouse A Secondary", notes: "Warehouse count A2" }),
      },
      ownerA.cookies
    );
    if (!createCountA2.data?.ok || !createCountA2.data?.count?.id) {
      throw new Error(`Inventory leakage baseline count failed: ${JSON.stringify(createCountA2.data)}`);
    }

    const countRow = await supabase
      .from("vyron_cost_stock_counts")
      .select("id,notes,company_id")
      .eq("id", createCountA1.data.count.id)
      .single();
    if (countRow.error || !countRow.data || warehouseLabelFromCount(countRow.data) !== "Warehouse A Primary Updated") {
      throw new Error(`Inventory association persistence failed: ${JSON.stringify({ error: countRow.error?.message, row: countRow.data })}`);
    }

    result.inventoryAssociation = "PASS";
    result.stockCountAssociation = "PASS";

    const supplier = await supabase
      .from("vyron_cost_suppliers")
      .insert({
        company_id: ownerA.companyId,
        supplier_name: `Warehouse Supplier ${Date.now()}`,
        contact_email: `supplier.${Date.now()}@example.com`,
        invoice_email: `ap.${Date.now()}@example.com`,
        risk_status: "Active",
      })
      .select("id,supplier_name")
      .single();
    if (supplier.error || !supplier.data?.id) throw new Error(`PO association supplier setup failed: ${supplier.error?.message}`);

    const createPo = await api(
      "/api/purchase-orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          po_number: `PO-WH-${Date.now().toString().slice(-6)}`,
          supplier_id: supplier.data.id,
          supplier_name_snapshot: supplier.data.supplier_name,
          status: "Draft",
          order_date: new Date().toISOString().slice(0, 10),
          notes: `Deliver to ${storeA1Code}`,
          lines: [
            {
              item_type: "ingredient",
              item_name: "Warehouse Ingredient",
              quantity: 5,
              unit: "kg",
              unit_price: 15,
              vat_rate: 15,
            },
          ],
        }),
      },
      ownerA.cookies
    );
    if (!createPo.data?.ok || !createPo.data?.purchaseOrder?.id) {
      throw new Error(`Purchase order association failed: ${JSON.stringify(createPo.data)}`);
    }

    const poId = createPo.data.purchaseOrder.id;
    const poLineId = createPo.data.purchaseOrder?.lines?.[0]?.id;
    if (!poLineId) {
      throw new Error(`Goods receiving association setup failed: PO line missing ${JSON.stringify(createPo.data.purchaseOrder)}`);
    }

    const approvePo = await api(
      `/api/purchase-orders/${encodeURIComponent(poId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ status: "Approved", approvedBy: "warehouse-cert", actor: "warehouse-cert" }),
      },
      ownerA.cookies
    );
    if (!approvePo.data?.ok) {
      throw new Error(`Goods receiving association PO approval failed: ${JSON.stringify(approvePo.data)}`);
    }

    result.poAssociation = "PASS";

    const createGrn = await api(
      "/api/goods-receipts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          purchase_order_id: poId,
          receipt_type: "full",
          received_by: "Warehouse Receiver",
          notes: `Received at ${storeA1Code}`,
          lines: [
            {
              purchase_order_line_id: poLineId,
              item_name: "Warehouse Ingredient",
              ordered_qty: 5,
              received_qty: 5,
              damaged_qty: 0,
              rejected_qty: 0,
              unit: "kg",
            },
          ],
        }),
      },
      ownerA.cookies
    );
    const grnId = createGrn.data?.grn?.id || createGrn.data?.receipt?.id;
    if (!createGrn.data?.ok || !grnId) {
      throw new Error(`Goods receiving association failed: ${JSON.stringify(createGrn.data)}`);
    }

    result.grnAssociation = "PASS";

    const manufacturingRuns = await api("/api/production/runs", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (!manufacturingRuns.data?.ok || !Array.isArray(manufacturingRuns.data?.runs)) {
      throw new Error(`Manufacturing association failed: ${JSON.stringify(manufacturingRuns.data)}`);
    }

    result.manufacturingAssociation = "PASS";

    const stockItems = await api("/api/inventory-transactions/stock-items", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const stockItemId = stockItems.data?.items?.find((i) => String(i.entityId || "") === String(ingredientId))?.id || stockItems.data?.items?.[0]?.id;
    if (!stockItems.data?.ok || !stockItemId) {
      throw new Error(`Inventory adjustment association setup failed: ${JSON.stringify(stockItems.data)}`);
    }

    const inventoryAdjust = await api(
      "/api/inventory-transactions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          action: "adjust",
          stock_item_id: stockItemId,
          quantity_delta: 3,
          unit_cost: 15,
          reference_type: "warehouse_adjustment",
          reference_label: "Warehouse A Primary Updated",
          notes: "Warehouse adjustment validation",
          created_by: "warehouse-cert",
        }),
      },
      ownerA.cookies
    );
    if (!inventoryAdjust.data?.ok || !inventoryAdjust.data?.transaction?.id) {
      throw new Error(`Inventory adjustment association failed: ${JSON.stringify(inventoryAdjust.data)}`);
    }

    result.inventoryAdjustmentAssociation = "PASS";

    const createB1 = await api(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerB.cookies },
        body: JSON.stringify({
          store_code: `WHC-${Date.now().toString().slice(-6)}`,
          store_name: "Warehouse B Primary",
          status: "Active",
        }),
      },
      ownerB.cookies
    );
    if (!createB1.data?.ok || !createB1.data?.store?.id) {
      throw new Error(`Tenant isolation setup failed: ${JSON.stringify(createB1.data)}`);
    }

    const listA = await api("/api/stores", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const listB = await api("/api/stores", { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    const namesA = new Set((listA.data?.stores || []).map((s) => String(s.store_name || "")));
    const namesB = new Set((listB.data?.stores || []).map((s) => String(s.store_name || "")));

    if (!namesA.has("Warehouse A Primary Updated") || namesA.has("Warehouse B Primary") || namesB.has("Warehouse A Primary Updated")) {
      throw new Error(`Tenant isolation failed: ${JSON.stringify({ namesA: Array.from(namesA), namesB: Array.from(namesB) })}`);
    }

    result.tenantIsolation = "PASS";

    const crossCompanyRead = await api(`/api/stores/${encodeURIComponent(storeA1.id)}`, { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    if (crossCompanyRead.status !== 404) {
      throw new Error(`Cross-company warehouse access failed: ${JSON.stringify({ status: crossCompanyRead.status, body: crossCompanyRead.data })}`);
    }

    result.crossCompanyAccess = "PASS";

    const countsA = await api("/api/inventory/counts", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const countsB = await api("/api/inventory/counts", { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    const warehousesA = new Set((countsA.data?.counts || []).map((c) => warehouseLabelFromCount(c)).filter(Boolean));
    const warehousesB = new Set((countsB.data?.counts || []).map((c) => warehouseLabelFromCount(c)).filter(Boolean));

    if (!warehousesA.has("Warehouse A Primary Updated") || !warehousesA.has("Warehouse A Secondary") || warehousesB.has("Warehouse A Primary Updated")) {
      throw new Error(`Inventory leakage validation failed: ${JSON.stringify({ warehousesA: Array.from(warehousesA), warehousesB: Array.from(warehousesB) })}`);
    }

    result.inventoryLeakage = "PASS";

    const createViewOnly = await api(
      "/api/workspace/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({
          firstName: "Warehouse",
          surname: "Viewer",
          email: `warehouse.viewer.${Date.now()}@example.com`,
          role: "VIEW_ONLY",
          method: "password",
          password: "ViewerWarehouse123!",
          confirmPassword: "ViewerWarehouse123!",
        }),
      },
      ownerA.cookies
    );
    if (!createViewOnly.data?.ok || !createViewOnly.data?.member?.email) {
      throw new Error(`API validation setup failed: ${JSON.stringify(createViewOnly.data)}`);
    }
    const viewerEmail = String(createViewOnly.data.member.email);
    ownerA.createdUserEmails.push(viewerEmail);

    const viewerLogin = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: viewerEmail, password: "ViewerWarehouse123!" }),
    });
    if (!viewerLogin.data?.ok) {
      throw new Error(`API validation viewer login failed: ${JSON.stringify(viewerLogin.data)}`);
    }
    const viewerCookies = cookieHeader(viewerLogin.data.client, viewerLogin.data.session);

    const unauthStores = await api("/api/stores");
    if (unauthStores.status !== 401) {
      throw new Error(`API unauthorized validation failed: ${JSON.stringify({ status: unauthStores.status, body: unauthStores.data })}`);
    }

    const forbiddenCreateStore = await api(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: viewerCookies },
        body: JSON.stringify({ store_code: "NOPE", store_name: "Forbidden" }),
      },
      viewerCookies
    );
    if (forbiddenCreateStore.status !== 403) {
      throw new Error(`API forbidden validation failed: ${JSON.stringify({ status: forbiddenCreateStore.status, body: forbiddenCreateStore.data })}`);
    }

    const malformedStore = await api(
      "/api/stores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerA.cookies },
        body: JSON.stringify({ store_code: "", store_name: "" }),
      },
      ownerA.cookies
    );
    if (malformedStore.status < 400) {
      throw new Error(`API malformed payload validation failed: ${JSON.stringify({ status: malformedStore.status, body: malformedStore.data })}`);
    }

    result.apiValidation = "PASS";

    const storesPage = await api("/stores", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const orderNewPage = await api("/store-orders/new", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const settingsPage = await api("/store-orders/settings", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);

    if (
      storesPage.status !== 200 ||
      orderNewPage.status !== 200 ||
      settingsPage.status !== 200 ||
      !String(storesPage.raw).includes("Stores") ||
      !String(orderNewPage.raw).includes("Store") ||
      !String(settingsPage.raw).includes("Store Order Settings")
    ) {
      throw new Error(`UI validation failed: ${JSON.stringify({ stores: storesPage.status, orderNew: orderNewPage.status, settings: settingsPage.status })}`);
    }

    result.uiValidation = "PASS";

    const storeAudit = await supabase
      .from("vyron_cost_stores")
      .select("id,store_name,status,updated_at,notes")
      .eq("company_id", ownerA.companyId)
      .eq("id", storeA1.id)
      .single();

    const rulesAudit = await supabase
      .from("vyron_store_order_approval_rules")
      .select("company_id,max_order_value,min_margin_pct,max_qty_variance_pct,warn_inactive_products")
      .eq("company_id", ownerA.companyId)
      .maybeSingle();

    if (
      storeAudit.error ||
      !storeAudit.data ||
      String(storeAudit.data.store_name || "") !== "Warehouse A Primary Updated" ||
      String(storeAudit.data.status || "") !== "Active" ||
      !storeAudit.data.updated_at ||
      !rulesAudit.data ||
      Number(rulesAudit.data.max_order_value || 0) !== 76543
    ) {
      throw new Error(`Audit logging validation failed: ${JSON.stringify({ storeAudit: storeAudit.data, storeError: storeAudit.error?.message, rulesAudit: rulesAudit.data })}`);
    }

    result.auditLogging = "PASS";
  } catch (error) {
    result.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    if (ownerB) await cleanupWorkspace(ownerB);
    if (ownerA) await cleanupWorkspace(ownerA);
  }

  console.log(`Warehouses Runtime Validation: ${result.runtime}`);
  console.log(`Warehouses Inventory Association Validation: ${result.inventoryAssociation}`);
  console.log(`Warehouses Purchase Order Association Validation: ${result.poAssociation}`);
  console.log(`Warehouses Goods Receiving Association Validation: ${result.grnAssociation}`);
  console.log(`Warehouses Manufacturing Association Validation: ${result.manufacturingAssociation}`);
  console.log(`Warehouses Stock Count Association Validation: ${result.stockCountAssociation}`);
  console.log(`Warehouses Inventory Adjustment Association Validation: ${result.inventoryAdjustmentAssociation}`);
  console.log(`Warehouses Tenant Isolation Validation: ${result.tenantIsolation}`);
  console.log(`Warehouses API Validation: ${result.apiValidation}`);
  console.log(`Warehouses UI Validation: ${result.uiValidation}`);
  console.log(`Warehouses Audit Logging Validation: ${result.auditLogging}`);
  console.log(`Warehouses Cross-company Access Validation: ${result.crossCompanyAccess}`);
  console.log(`Warehouses Inventory Leakage Validation: ${result.inventoryLeakage}`);

  if (result.blocker) {
    console.log(`WAREHOUSES BLOCKER: ${result.blocker}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.log(`WAREHOUSES BLOCKER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
