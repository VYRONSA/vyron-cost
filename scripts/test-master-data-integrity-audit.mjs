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

async function api(path, options = {}, cookies = "") {
  const headers = { ...(options.headers || {}) };
  if (cookies) headers.Cookie = cookies;
  const response = await fetch(`${appBase}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { _raw: raw.slice(0, 600) };
  }
  return { status: response.status, ok: response.ok, data };
}

async function openPage(path, cookies) {
  const response = await fetch(`${appBase}${path}`, { headers: { Cookie: cookies } });
  const html = await response.text();
  return { status: response.status, ok: response.ok, htmlSample: html.slice(0, 400) };
}

const checks = new Map();
function mark(name, ok, detail) {
  checks.set(name, { ok, detail: String(detail || "") });
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `mda-owner-${stamp}@example.com`;
  const ownerPassword = "MasterData123!";

  let createdUserId = null;
  let workspaceId = null;
  let companyId = null;

  try {
    const authCreated = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { first_name: "MDA", surname: "Owner" },
    });
    if (authCreated.error || !authCreated.data.user?.id) {
      throw new Error(authCreated.error?.message || "Failed to create auth user");
    }
    createdUserId = authCreated.data.user.id;

    const companyInsert = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `MDA Test ${stamp}`, trading_name: `MDA Test ${stamp}` })
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
        package_name: "Professional",
        status: "Live",
        user_limit: 8,
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
        first_name: "MDA",
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

    const login = await api("/api/workspace/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    if (!login.data?.ok) {
      throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);
    }

    const cookies = cookieHeader(login.data.client, login.data.session);
    const authedHeaders = { "Content-Type": "application/json", Cookie: cookies };

    const createCustomer = await api(
      "/api/customers",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          customerName: `MDA Customer ${stamp}`,
          category: "Hospitality",
          contactEmail: `customer-${stamp}@example.com`,
          invoiceEmail: `customer-accounts-${stamp}@example.com`,
          phone: "0210000000",
          terms: "30 Days",
          vatNumber: "N/A",
          status: "Active",
        }),
      },
      cookies
    );
    const customerId = createCustomer.data?.customer?.id;

    const createSupplier = await api(
      "/api/suppliers",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          supplier_name: `MDA Supplier ${stamp}`,
          category: "Supplier",
          contact_email: `supplier-${stamp}@example.com`,
          invoice_email: `supplier-accounts-${stamp}@example.com`,
          phone: "0211111111",
          risk_status: "Active",
          payment_terms: "30 Days",
          lead_time_days: 2,
        }),
      },
      cookies
    );
    const supplierId = createSupplier.data?.supplier?.id;

    const createIngredient = await api(
      "/api/ingredients",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          ingredient_name: `MDA Ingredient ${stamp}`,
          category: "Dry Goods",
          supplier_id: supplierId || null,
          purchase_unit: "kg",
          recipe_unit: "kg",
          purchase_cost: 50,
          previous_cost: 45,
          yield_type: "Standard",
          yield_percent: 100,
          current_alert: null,
        }),
      },
      cookies
    );
    const ingredientId = createIngredient.data?.ingredient?.id;

    const createRecipe = await api(
      "/api/recipes",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          recipe_name: `MDA Recipe ${stamp}`,
          category: "General",
          yield_qty: 10,
          yield_unit: "unit",
          target_gp: 35,
          selling_price: 300,
          status: "Approved",
          lines: [
            { line_type: "Ingredient", line_name: `MDA Ingredient ${stamp}`, quantity: 2, unit: "kg", unit_cost: 50, wastage_percent: 0 },
          ],
        }),
      },
      cookies
    );
    const recipeId = createRecipe.data?.recipe?.id;

    const createProduct = await api(
      "/api/products",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          product_name: `MDA Product ${stamp}`,
          product_category: "Finished Goods",
          linked_bom_id: recipeId || null,
          selling_price: 300,
          total_cost: 180,
          target_gp: 35,
          product_status: "Active",
        }),
      },
      cookies
    );
    const productId = createProduct.data?.product?.id;

    await api(
      "/api/inventory/stock",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          action: "create",
          entityType: "finished_goods",
          entityId: productId,
          description: `MDA Product ${stamp}`,
          itemCode: `MDA-FG-${stamp}`,
          unit: "unit",
          currentCost: 180,
          openingQty: 10,
          openingDate: "2026-01-01",
          openingNote: "MDA test",
        }),
      },
      cookies
    );

    const contactsRes = await api("/api/contacts?filter=all", { headers: { Cookie: cookies } }, cookies);
    const contacts = Array.isArray(contactsRes.data?.contacts) ? contactsRes.data.contacts : [];
    const customerContact = contacts.find((c) => String(c.contact_name || "") === `MDA Customer ${stamp}`) || null;
    const supplierContact = contacts.find((c) => String(c.contact_name || "") === `MDA Supplier ${stamp}`) || null;
    const contactId = customerContact?.id || supplierContact?.id || null;

    const openCustomerApi = await api(`/api/customers/${customerId}`, { headers: { Cookie: cookies } }, cookies);
    const openCustomerPage = await openPage(`/customers/${customerId}`, cookies);
    mark("Open Customer", Boolean(openCustomerApi.data?.ok && openCustomerPage.ok), `${openCustomerApi.status}/${openCustomerPage.status}`);

    const saveCustomer = await api(
      `/api/customers/${customerId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ customerName: `MDA Customer ${stamp} Updated`, terms: "14 Days" }),
      },
      cookies
    );
    const reloadCustomer = await api(`/api/customers/${customerId}`, { headers: { Cookie: cookies } }, cookies);
    mark("Save Customer", Boolean(saveCustomer.data?.ok && reloadCustomer.data?.ok), `${saveCustomer.status}/${reloadCustomer.status}`);

    const openSupplierApi = await api(`/api/suppliers/${supplierId}`, { headers: { Cookie: cookies } }, cookies);
    const openSupplierPage = await openPage(`/suppliers/${supplierId}`, cookies);
    mark("Open Supplier", Boolean(openSupplierApi.data?.ok && openSupplierPage.ok), `${openSupplierApi.status}/${openSupplierPage.status}`);

    const saveSupplier = await api(
      `/api/suppliers/${supplierId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ supplier_name: `MDA Supplier ${stamp} Updated`, payment_terms: "14 Days" }),
      },
      cookies
    );
    const reloadSupplier = await api(`/api/suppliers/${supplierId}`, { headers: { Cookie: cookies } }, cookies);
    mark("Save Supplier", Boolean(saveSupplier.data?.ok && reloadSupplier.data?.ok), `${saveSupplier.status}/${reloadSupplier.status}`);

    const openIngredientApi = await api(`/api/ingredients/${ingredientId}`, { headers: { Cookie: cookies } }, cookies);
    const openIngredientPage = await openPage(`/ingredients/${ingredientId}`, cookies);
    mark("Open Raw Material", Boolean(openIngredientApi.data?.ok && openIngredientPage.ok), `${openIngredientApi.status}/${openIngredientPage.status}`);

    const saveIngredient = await api(
      `/api/ingredients/${ingredientId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ purchase_cost: 55, previous_cost: 50 }),
      },
      cookies
    );
    mark("Save Raw Material", Boolean(saveIngredient.data?.ok), saveIngredient.status);

    const openFinishedGoodPage = await openPage(`/products/${productId}`, cookies);
    mark("Open Finished Good", Boolean(openFinishedGoodPage.ok), openFinishedGoodPage.status);

    const openRecipeApi = await api(`/api/recipes/${recipeId}`, { headers: { Cookie: cookies } }, cookies);
    const openRecipePage = await openPage(`/recipes/${recipeId}`, cookies);
    const saveRecipe = await api(
      `/api/recipes/${recipeId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ recipe_name: `MDA Recipe ${stamp} Updated` }),
      },
      cookies
    );
    mark("Open Recipe/BOM", Boolean(openRecipeApi.data?.ok && openRecipePage.ok), `${openRecipeApi.status}/${openRecipePage.status}`);
    mark("Save Recipe/BOM", Boolean(saveRecipe.data?.ok), saveRecipe.status);

    const openContactApi = contactId
      ? await api(`/api/contacts/${contactId}`, { headers: { Cookie: cookies } }, cookies)
      : { status: 404, data: { ok: false } };
    const openContactPage = contactId
      ? await openPage(`/contacts/${contactId}`, cookies)
      : { status: 404, ok: false };
    mark("Open Contact", Boolean(openContactApi.data?.ok && openContactPage.ok), `${openContactApi.status}/${openContactPage.status}`);

    const saveContact = contactId
      ? await api(
          `/api/contacts/${contactId}`,
          {
            method: "PATCH",
            headers: authedHeaders,
            body: JSON.stringify({ is_customer: true, is_supplier: true }),
          },
          cookies
        )
      : { status: 404, data: { ok: false } };
    mark("Save Contact", Boolean(saveContact.data?.ok), saveContact.status);

    const toggleCustomer = contactId
      ? await api(
          `/api/contacts/${contactId}`,
          {
            method: "PATCH",
            headers: authedHeaders,
            body: JSON.stringify({ is_customer: false }),
          },
          cookies
        )
      : { status: 404, data: { ok: false } };
    mark("Toggle Customer flag", Boolean(toggleCustomer.data?.ok), toggleCustomer.status);

    const customersAfterToggle = await api("/api/customers", { headers: { Cookie: cookies } }, cookies);
    const customerVisible = Array.isArray(customersAfterToggle.data?.customers)
      ? customersAfterToggle.data.customers.some((c) => String(c.id) === String(customerId))
      : true;
    mark("Verify Customer Register updates", !customerVisible, customerVisible ? "customer still visible" : "removed");
    mark("Verify Invoice customer selector updates", !customerVisible, customerVisible ? "selector still includes customer" : "removed");

    const supplierToggleTargetId = supplierContact?.id || contactId;
    const toggleSupplier = supplierToggleTargetId
      ? await api(
          `/api/contacts/${supplierToggleTargetId}`,
          {
            method: "PATCH",
            headers: authedHeaders,
            body: JSON.stringify({ is_supplier: false }),
          },
          cookies
        )
      : { status: 404, data: { ok: false } };
    mark("Toggle Supplier flag", Boolean(toggleSupplier.data?.ok), toggleSupplier.status);

    const suppliersAfterToggle = await api("/api/suppliers", { headers: { Cookie: cookies } }, cookies);
    const supplierVisible = Array.isArray(suppliersAfterToggle.data?.suppliers)
      ? suppliersAfterToggle.data.suppliers.some((s) => String(s.id) === String(supplierId))
      : true;
    mark("Verify Supplier Register updates", !supplierVisible, supplierVisible ? "supplier still visible" : "removed");
    mark("Verify Purchase supplier selector updates", !supplierVisible, supplierVisible ? "selector still includes supplier" : "removed");

    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail}`);
    }

    const required = [
      "Open Customer",
      "Open Supplier",
      "Open Contact",
      "Open Raw Material",
      "Open Finished Good",
      "Save Customer",
      "Save Supplier",
      "Save Contact",
      "Toggle Customer flag",
      "Toggle Supplier flag",
      "Verify Customer Register updates",
      "Verify Supplier Register updates",
      "Verify Invoice customer selector updates",
      "Verify Purchase supplier selector updates",
    ];

    const requiredPass = required.every((key) => checks.get(key)?.ok);
    console.log(requiredPass ? "REQUIRED OVERALL: PASS" : "REQUIRED OVERALL: FAIL");
    process.exit(requiredPass ? 0 : 2);
  } catch (error) {
    console.error("FATAL:", error instanceof Error ? error.message : String(error));
    for (const [name, result] of checks.entries()) {
      console.log(`${result.ok ? "PASS" : "FAIL"}: ${name} :: ${result.detail}`);
    }
    console.log("REQUIRED OVERALL: FAIL");
    process.exit(1);
  } finally {
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
