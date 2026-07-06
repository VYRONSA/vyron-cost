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
const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3007";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const checks = [];
function mark(name, status, detail) {
  checks.push({ name, status, detail });
}
function pass(name, detail = "") {
  mark(name, "PASS", detail);
}
function fail(name, detail = "") {
  mark(name, "FAIL", detail);
}

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
    data = { _raw: raw.slice(0, 1200) };
  }
  return { status: response.status, ok: response.ok, data };
}

async function createWorkspaceOwner(stamp) {
  const email = `mfg-owner-${stamp}@example.com`;
  const password = "Manufacturing123!";

  const authCreated = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "MFG", surname: "Owner" },
  });
  if (authCreated.error || !authCreated.data.user?.id) {
    throw new Error(authCreated.error?.message || "Failed to create owner auth user");
  }
  const userId = authCreated.data.user.id;

  const companyInsert = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `MFG Enterprise ${stamp}`, trading_name: `MFG Enterprise ${stamp}` })
    .select("id, name, trading_name")
    .single();
  if (companyInsert.error) throw companyInsert.error;

  const companyId = companyInsert.data.id;

  const workspaceInsert = await supabase
    .from("vyron_workspaces")
    .insert({
      company_id: companyId,
      company_name: companyInsert.data.name,
      trading_name: companyInsert.data.trading_name,
      package_name: "Professional",
      status: "Live",
      user_limit: 10,
      owner_user_id: userId,
      contact_email: email,
    })
    .select("id")
    .single();
  if (workspaceInsert.error) throw workspaceInsert.error;

  const workspaceId = workspaceInsert.data.id;

  const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
    {
      id: userId,
      email,
      first_name: "MFG",
      surname: "Owner",
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
  if (membershipInsert.error) throw membershipInsert.error;

  const login = await json("/api/workspace/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) {
    throw new Error(`Workspace login failed: ${login.data?.error || login.status}`);
  }

  return {
    email,
    userId,
    companyId,
    workspaceId,
    cookies: cookieHeader(login.data.client, login.data.session),
  };
}

async function cleanupWorkspace(workspace) {
  if (!workspace) return;
  await supabase.from("vyron_workspace_memberships").delete().eq("workspace_id", workspace.workspaceId);
  await supabase.from("vyron_workspaces").delete().eq("id", workspace.workspaceId);
  await supabase.from("vyron_cost_companies").delete().eq("id", workspace.companyId);
}

async function cleanupUser(user) {
  if (!user) return;
  await supabase.from("vyron_user_profiles").delete().eq("id", user.userId);
  await supabase.auth.admin.deleteUser(user.userId);
}

async function main() {
  const stamp = Date.now();
  let owner = null;
  let ingredientId = null;
  let recipeId = null;
  let productId = null;
  let runId = null;

  try {
    owner = await createWorkspaceOwner(stamp);

    const headers = { "Content-Type": "application/json", Cookie: owner.cookies };

    const ingredientCreate = await json(
      "/api/ingredients",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ingredient_name: `MFG Ingredient ${stamp}`,
          category: "Raw Materials",
          purchase_unit: "kg",
          recipe_unit: "kg",
          purchase_cost: 15,
          yield_percent: 100,
        }),
      },
      owner.cookies
    );

    if (!ingredientCreate.data?.ok || !ingredientCreate.data.ingredient?.id) {
      fail("Create Raw Material", JSON.stringify({ status: ingredientCreate.status, data: ingredientCreate.data }));
      throw new Error("Raw material creation failed");
    }
    ingredientId = ingredientCreate.data.ingredient.id;
    pass("Create Raw Material", ingredientId);

    const stockItemLookup = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", owner.companyId)
      .eq("entity_id", ingredientId)
      .limit(1)
      .maybeSingle();

    let stockItemId = stockItemLookup.data?.id || null;
    if (stockItemLookup.error) {
      fail("Inventory Seed", stockItemLookup.error.message);
      throw stockItemLookup.error;
    }

    if (!stockItemId) {
      const stockInsert = await supabase
        .from("vyron_cost_stock_items")
        .insert({
          company_id: owner.companyId,
          entity_type: "ingredient",
          entity_id: ingredientId,
          item_code: `ING-${String(ingredientId).slice(0, 8).toUpperCase()}`,
          description: `MFG Ingredient ${stamp}`,
          unit: "kg",
          average_cost: 15,
          current_cost: 15,
          qty_on_hand: 0,
          inventory_value: 0,
          stock_status: "In Stock",
        })
        .select("id")
        .single();
      if (stockInsert.error || !stockInsert.data?.id) {
        fail("Inventory Seed", stockInsert.error?.message || "Unable to create stock item");
        throw new Error("Cannot seed inventory without stock item");
      }
      stockItemId = stockInsert.data.id;
    }

    const seedQty = 500;
    const stockSeed = await supabase
      .from("vyron_cost_stock_items")
      .update({
        qty_on_hand: seedQty,
        average_cost: 15,
        current_cost: 15,
        inventory_value: seedQty * 15,
        stock_status: "In Stock",
        updated_at: new Date().toISOString(),
      })
      .eq("id", stockItemId)
      .eq("company_id", owner.companyId);

    if (stockSeed.error) {
      fail("Inventory Seed", stockSeed.error.message);
      throw stockSeed.error;
    }
    pass("Inventory Seed", `Seeded ${seedQty}kg`);

    const recipeCreate = await json(
      "/api/recipes",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipe_name: `MFG Recipe ${stamp}`,
          category: "General",
          yield_qty: 100,
          yield_unit: "unit",
          target_gp: 35,
          selling_price: 25,
          status: "Approved",
          lines: [
            {
              line_type: "Ingredient",
              ingredient_id: ingredientId,
              line_name: `MFG Ingredient ${stamp}`,
              quantity: 20,
              unit: "kg",
              unit_cost: 15,
              wastage_percent: 0,
            },
          ],
        }),
      },
      owner.cookies
    );

    if (!recipeCreate.data?.ok || !recipeCreate.data.recipe?.id) {
      fail("Create Recipe/BOM", JSON.stringify({ status: recipeCreate.status, data: recipeCreate.data }));
      throw new Error("Recipe creation failed");
    }
    recipeId = recipeCreate.data.recipe.id;
    pass("Create Recipe/BOM", recipeId);

    const productCreate = await json(
      "/api/products",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          product_name: `MFG Product ${stamp}`,
          product_category: "Finished Goods",
          linked_bom_id: recipeId,
          selling_price: 35,
          total_cost: 0,
          target_gp: 35,
          product_status: "Active",
        }),
      },
      owner.cookies
    );

    if (!productCreate.data?.ok || !productCreate.data.product?.id) {
      fail("Create Finished Good", JSON.stringify({ status: productCreate.status, data: productCreate.data }));
      throw new Error("Product creation failed");
    }
    productId = productCreate.data.product.id;
    pass("Create Finished Good", productId);

    let fgUpsert = await supabase.from("vyron_finished_goods").upsert(
      {
        id: productId,
        company_id: owner.companyId,
        product_code: `FG-${String(productId).slice(0, 8).toUpperCase()}`,
        product_name: `MFG Product ${stamp}`,
        category: "Finished Goods",
        current_stock: 0,
        stock_value: 0,
        standard_cost: 0,
        latest_actual_cost: 0,
        selling_price: 35,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (fgUpsert.error && String(fgUpsert.error.message || "").includes("selling_price")) {
      fgUpsert = await supabase.from("vyron_finished_goods").upsert(
        {
          id: productId,
          company_id: owner.companyId,
          product_code: `FG-${String(productId).slice(0, 8).toUpperCase()}`,
          product_name: `MFG Product ${stamp}`,
          category: "Finished Goods",
          current_stock: 0,
          stock_value: 0,
          standard_cost: 0,
          latest_actual_cost: 0,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }
    if (fgUpsert.error) {
      fail("Prime Finished Goods Record", fgUpsert.error.message);
      throw fgUpsert.error;
    }
    pass("Prime Finished Goods Record");

    const runCreate = await json(
      "/api/production/runs",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ bom_id: recipeId, product_id: productId, planned_qty: 100, created_by: "mfg-lifecycle-script" }),
      },
      owner.cookies
    );

    if (!runCreate.data?.ok || !runCreate.data.run?.id) {
      fail("Create Production Run", JSON.stringify({ status: runCreate.status, data: runCreate.data }));
      throw new Error("Production run create failed");
    }
    runId = runCreate.data.run.id;
    pass("Create Production Run", runId);

    const approveRun = await json(
      `/api/production/runs/${runId}/approve`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ actor: "mfg-lifecycle-script" }),
      },
      owner.cookies
    );
    if (!approveRun.data?.ok) {
      fail("Approve", JSON.stringify({ status: approveRun.status, data: approveRun.data }));
      throw new Error("Approve failed");
    }
    pass("Approve", approveRun.data?.run?.status || "Approved");

    const startRun = await json(
      `/api/production/runs/${runId}/start`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ actor: "mfg-lifecycle-script" }),
      },
      owner.cookies
    );
    if (!startRun.data?.ok) {
      fail("Start", JSON.stringify({ status: startRun.status, data: startRun.data }));
      throw new Error("Start failed");
    }
    pass("Start", startRun.data?.run?.status || "In Production");

    const beforeIngredient = await supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand")
      .eq("id", stockItemId)
      .single();

    const completeRun = await json(
      `/api/production/runs/${runId}/complete`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          actual_qty: 100,
          stock_override: false,
          completed_by: "mfg-lifecycle-script",
        }),
      },
      owner.cookies
    );

    if (!completeRun.data?.ok) {
      fail("Complete", JSON.stringify({ status: completeRun.status, data: completeRun.data }));
      throw new Error("Complete failed");
    }
    pass("Complete", completeRun.data?.run?.status || "Completed");

    const reverseRun = await json(
      `/api/production/runs/${runId}/reverse`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          reason: "Enterprise lifecycle verification",
          actor: "mfg-lifecycle-script",
          supervisor: true,
        }),
      },
      owner.cookies
    );

    if (!reverseRun.data?.ok) {
      fail("Reverse", JSON.stringify({ status: reverseRun.status, data: reverseRun.data }));
      throw new Error("Reverse failed");
    }
    pass("Reverse", reverseRun.data?.run?.status || "Reversed");

    const afterIngredient = await supabase
      .from("vyron_cost_stock_items")
      .select("qty_on_hand")
      .eq("id", stockItemId)
      .single();

    if (!beforeIngredient.error && !afterIngredient.error) {
      const beforeQty = Number(beforeIngredient.data?.qty_on_hand || 0);
      const afterQty = Number(afterIngredient.data?.qty_on_hand || 0);
      pass("Inventory Consumption", `Ingredient stock moved ${beforeQty} -> ${afterQty} during complete+reverse`);
    } else {
      fail("Inventory Consumption", beforeIngredient.error?.message || afterIngredient.error?.message || "Unable to read stock item");
    }

    const fgState = await supabase
      .from("vyron_finished_goods")
      .select("current_stock, stock_value, latest_actual_cost")
      .eq("id", productId)
      .eq("company_id", owner.companyId)
      .maybeSingle();

    if (!fgState.error && fgState.data) {
      pass(
        "Finished Goods Update",
        `current_stock=${Number(fgState.data.current_stock || 0)}, value=${Number(fgState.data.stock_value || 0)}, latest_actual_cost=${Number(fgState.data.latest_actual_cost || 0)}`
      );
    } else {
      fail("Finished Goods Update", fgState.error?.message || "No finished goods row");
    }

    const lineState = await supabase
      .from("vyron_cost_production_run_lines")
      .select("actual_qty,actual_value,planned_qty")
      .eq("production_run_id", runId)
      .eq("company_id", owner.companyId);

    if (!lineState.error && Array.isArray(lineState.data) && lineState.data.length > 0) {
      const actualTotal = lineState.data.reduce((s, row) => s + Number(row.actual_qty || 0), 0);
      pass("Recipe Consumption", `Run line actual qty total=${actualTotal}`);
    } else {
      fail("Recipe Consumption", lineState.error?.message || "No production run lines");
    }

    const auditState = await supabase
      .from("vyron_cost_production_audit_log")
      .select("event_type,created_at")
      .eq("production_run_id", runId)
      .eq("company_id", owner.companyId)
      .order("created_at", { ascending: true });

    if (!auditState.error && Array.isArray(auditState.data) && auditState.data.length >= 4) {
      const events = auditState.data.map((r) => String(r.event_type));
      pass("Audit Trail", events.join(" | "));
    } else {
      fail("Audit Trail", auditState.error?.message || "Insufficient audit events");
    }

    const productState = await supabase
      .from("vyron_cost_products")
      .select("total_cost,updated_at")
      .eq("id", productId)
      .eq("company_id", owner.companyId)
      .maybeSingle();

    if (!productState.error && productState.data) {
      pass("Cost Roll-up", `total_cost=${Number(productState.data.total_cost || 0)}`);
    } else {
      fail("Cost Roll-up", productState.error?.message || "No product row");
    }

    for (const check of checks) {
      console.log(`${check.status}: ${check.name} :: ${check.detail || ""}`);
    }

    const failed = checks.filter((c) => c.status === "FAIL");
    const overall = failed.length ? "FAIL" : "PASS";
    console.log(`OVERALL: ${overall}`);
    process.exit(failed.length ? 2 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FATAL:", message);
    for (const check of checks) {
      console.log(`${check.status}: ${check.name} :: ${check.detail || ""}`);
    }
    console.log("OVERALL: FAIL");
    process.exit(1);
  } finally {
    await cleanupWorkspace(owner);
    await cleanupUser(owner);
  }
}

main();
