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
    data = { _raw: raw.slice(0, 500) };
  }
  return { status: response.status, ok: response.ok, data };
}

const checks = new Map();
function mark(name, ok, detail) {
  checks.set(name, { ok, detail });
}

async function main() {
  const stamp = Date.now();
  const ownerEmail = `fg-owner-${stamp}@example.com`;
  const ownerPassword = "FinishedGoods123!";

  let createdUserId = null;
  let workspaceId = null;
  let companyId = null;
  let bomId = null;
  let productId = null;
  let unreferencedProductId = null;

  try {
    const authCreated = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { first_name: "FG", surname: "Owner" },
    });
    if (authCreated.error || !authCreated.data.user?.id) {
      throw new Error(authCreated.error?.message || "Failed to create auth user");
    }
    createdUserId = authCreated.data.user.id;

    const companyInsert = await supabase
      .from("vyron_cost_companies")
      .insert({ name: `FG Test ${stamp}`, trading_name: `FG Test ${stamp}` })
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
        user_limit: 5,
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
        first_name: "FG",
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

    const createBom = await json(
      "/api/recipes",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          recipe_name: `FG BOM ${stamp}`,
          category: "General",
          yield_qty: 10,
          yield_unit: "unit",
          target_gp: 35,
          selling_price: 240,
          status: "Approved",
          lines: [
            { line_type: "Ingredient", line_name: "Flour", quantity: 1.2, unit: "kg", unit_cost: 22, wastage_percent: 1 },
            { line_type: "Packaging", line_name: "Bag", quantity: 10, unit: "unit", unit_cost: 1.5, wastage_percent: 0 },
          ],
        }),
      },
      cookies
    );
    if (!createBom.data?.ok) throw new Error(`Create BOM failed: ${createBom.data?.error || createBom.status}`);
    bomId = createBom.data.recipe.id;

    const createProduct = await json(
      "/api/products",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          product_name: `FG Product ${stamp}`,
          product_category: "Finished Goods",
          linked_bom_id: bomId,
          selling_price: 240,
          total_cost: 140,
          target_gp: 35,
          product_status: "Active",
        }),
      },
      cookies
    );
    mark("Create Finished Good", Boolean(createProduct.data?.ok), createProduct.data?.error || createProduct.status);
    if (!createProduct.data?.ok) throw new Error(`Create product failed: ${createProduct.data?.error || createProduct.status}`);
    productId = createProduct.data.product.id;

    mark(
      "BOM Link",
      String(createProduct.data.product.linked_bom_id || "") === String(bomId),
      `linked_bom_id=${createProduct.data.product.linked_bom_id || "null"}`
    );

    const editProduct = await json(
      `/api/products/${productId}`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ product_name: `FG Product ${stamp} Edited`, selling_price: 250 }),
      },
      cookies
    );
    const editOk = Boolean(editProduct.data?.ok);
    mark("Edit Finished Good", editOk, editProduct.data?.error || editProduct.status);
    mark("Save", editOk, editProduct.data?.error || editProduct.status);

    const productList = await json("/api/products", { headers: { Cookie: cookies } }, cookies);
    const reloaded = Boolean(productList.data?.ok && (productList.data.products || []).some((p) => p.id === productId));
    mark("Reload", reloaded, reloaded ? "Product returned by GET /api/products" : productList.data?.error || productList.status);

    const openStockCreate = await json(
      "/api/inventory/stock",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          action: "create",
          entityType: "finished_goods",
          entityId: productId,
          description: `FG Product ${stamp}`,
          itemCode: `FG-${stamp}`,
          unit: "unit",
          currentCost: 140,
          openingQty: 15,
          openingDate: "2026-01-01",
          openingNote: "FG critical test",
        }),
      },
      cookies
    );
    if (!openStockCreate.data?.ok) {
      mark("Open", false, `Opening stock creation failed: ${openStockCreate.data?.error || openStockCreate.status}`);
    } else {
      const fgList = await json("/api/inventory/finished-goods", { headers: { Cookie: cookies } }, cookies);
      if (!fgList.data?.ok) {
        mark("Open", false, `FG list failed: ${fgList.data?.error || fgList.status}`);
      } else {
        const row = (fgList.data?.items || []).find((item) => item.productId === productId || item.id === productId);
        const pageOpen = await fetch(`${appBase}/products/${productId}`, { headers: { Cookie: cookies } });
        const html = await pageOpen.text();
        const notFound = html.toLowerCase().includes("product not found");
        mark(
          "Open",
          Boolean(row && pageOpen.ok && !notFound),
          row
            ? `row.productId=${row.productId}; pageStatus=${pageOpen.status}; notFound=${notFound}`
            : "Product not listed"
        );
      }
    }

    const searchNeedle = (editOk ? `FG Product ${stamp} Edited` : `FG Product ${stamp}`).toLowerCase();
    const listedProducts = Array.isArray(productList.data?.products) ? productList.data.products : [];
    const searchMatch = listedProducts.some((p) => String(p.product_name || "").toLowerCase().includes(searchNeedle));
    mark("Search", searchMatch, searchMatch ? "Client-side filter match found" : "No matching product_name in /api/products");

    const deleteAttempt = await json(`/api/products/${productId}`, { method: "DELETE", headers: { Cookie: cookies } }, cookies);
    const deleteBlocked = deleteAttempt.status === 409 && deleteAttempt.data?.code === "PRODUCT_REFERENCED";
    mark(
      "Delete",
      deleteBlocked,
      deleteBlocked
        ? JSON.stringify(deleteAttempt.data.references || {})
        : JSON.stringify({ status: deleteAttempt.status, data: deleteAttempt.data })
    );

    const archiveAttempt = await json(
      `/api/products/${productId}?mode=archive`,
      { method: "DELETE", headers: { Cookie: cookies } },
      cookies
    );
    mark(
      "Archive",
      Boolean(archiveAttempt.data?.ok && archiveAttempt.data?.mode === "archived"),
      JSON.stringify({ status: archiveAttempt.status, data: archiveAttempt.data })
    );

    const createUnreferenced = await json(
      "/api/products",
      {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({
          product_name: `FG Delete Candidate ${stamp}`,
          product_category: "Finished Goods",
          selling_price: 99,
          total_cost: 50,
          target_gp: 25,
          product_status: "Active",
        }),
      },
      cookies
    );
    if (createUnreferenced.data?.ok) {
      unreferencedProductId = createUnreferenced.data.product.id;
      const hardDelete = await json(
        `/api/products/${unreferencedProductId}`,
        { method: "DELETE", headers: { Cookie: cookies } },
        cookies
      );
      if (!hardDelete.data?.ok || hardDelete.data?.mode !== "deleted") {
        mark(
          "Delete (Hard Mode)",
          false,
          `Hard delete path failed: ${JSON.stringify({ status: hardDelete.status, data: hardDelete.data })}`
        );
      } else {
        mark("Delete (Hard Mode)", true, "Unreferenced product deleted.");
      }
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
