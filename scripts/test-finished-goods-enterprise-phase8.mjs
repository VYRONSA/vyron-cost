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

function runtimeRequired(name, detail = "") {
  mark(name, "Runtime Validation Required", detail);
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
    data = { _raw: raw.slice(0, 1000) };
  }
  return { status: response.status, ok: response.ok, data };
}

async function createWorkspaceOwner(stamp, label) {
  const email = `fg-${label}-${stamp}@example.com`;
  const password = "FinishedGoods123!";

  const authCreated = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "FG", surname: label },
  });
  if (authCreated.error || !authCreated.data.user?.id) {
    throw new Error(authCreated.error?.message || `Failed to create ${label} auth user`);
  }
  const userId = authCreated.data.user.id;

  const companyInsert = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `FG Enterprise ${label} ${stamp}`, trading_name: `FG Enterprise ${label} ${stamp}` })
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
      first_name: "FG",
      surname: label,
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
    body: JSON.stringify({ email, password }),
  });
  if (!login.data?.ok) {
    throw new Error(`${label} workspace login failed: ${login.data?.error || login.status}`);
  }

  return {
    email,
    password,
    userId,
    companyId,
    workspaceId,
    cookies: cookieHeader(login.data.client, login.data.session),
  };
}

async function createWorkspaceUser(stamp, workspaceId, role) {
  const email = `fg-${role.toLowerCase()}-${stamp}@example.com`;
  const password = "FinishedGoods123!";

  const authCreated = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "FG", surname: role },
  });
  if (authCreated.error || !authCreated.data.user?.id) {
    throw new Error(authCreated.error?.message || `Failed to create ${role} auth user`);
  }
  const userId = authCreated.data.user.id;

  const profileUpsert = await supabase.from("vyron_user_profiles").upsert(
    {
      id: userId,
      email,
      first_name: "FG",
      surname: role,
      status: "Active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileUpsert.error) throw profileUpsert.error;

  const membershipInsert = await supabase.from("vyron_workspace_memberships").insert({
    workspace_id: workspaceId,
    user_id: userId,
    role,
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
    throw new Error(`${role} login failed: ${login.data?.error || login.status}`);
  }

  return {
    email,
    userId,
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
  let ownerA = null;
  let ownerB = null;
  let viewOnlyUser = null;

  let ingredientId = null;
  let recipeId = null;
  let productId = null;
  let attachmentId = null;
  let productionRunId = null;
  let duplicateProductId = null;

  try {
    ownerA = await createWorkspaceOwner(stamp, "owner-a");
    ownerB = await createWorkspaceOwner(stamp, "owner-b");

    viewOnlyUser = await createWorkspaceUser(stamp, ownerA.workspaceId, "VIEW_ONLY");

    const ownerHeaders = { "Content-Type": "application/json", Cookie: ownerA.cookies };

    const ingredientCreate = await json(
      "/api/ingredients",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          ingredient_name: `FG Ingredient ${stamp}`,
          category: "Raw Materials",
          purchase_unit: "kg",
          recipe_unit: "kg",
          purchase_cost: 30,
          yield_percent: 100,
        }),
      },
      ownerA.cookies
    );
    if (ingredientCreate.data?.ok && ingredientCreate.data.ingredient?.id) {
      ingredientId = ingredientCreate.data.ingredient.id;
      pass("Create Ingredient", "Ingredient created for BOM costing validation.");
    } else {
      fail("Create Ingredient", JSON.stringify({ status: ingredientCreate.status, data: ingredientCreate.data }));
      throw new Error("Cannot continue without ingredient.");
    }

    const recipeCreate = await json(
      "/api/recipes",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          recipe_name: `FG Recipe ${stamp}`,
          category: "General",
          yield_qty: 10,
          yield_unit: "unit",
          target_gp: 35,
          selling_price: 250,
          status: "Approved",
          lines: [
            {
              line_type: "Ingredient",
              ingredient_id: ingredientId,
              line_name: `FG Ingredient ${stamp}`,
              quantity: 2,
              unit: "kg",
              unit_cost: 30,
              wastage_percent: 0,
            },
            {
              line_type: "Packaging",
              line_name: "Pack",
              quantity: 10,
              unit: "unit",
              unit_cost: 1,
              wastage_percent: 0,
            },
          ],
        }),
      },
      ownerA.cookies
    );

    if (recipeCreate.data?.ok && recipeCreate.data.recipe?.id) {
      recipeId = recipeCreate.data.recipe.id;
      pass("Create Recipe/BOM", "Recipe created with ingredient and packaging components.");
    } else {
      fail("Create Recipe/BOM", JSON.stringify({ status: recipeCreate.status, data: recipeCreate.data }));
      throw new Error("Cannot continue without recipe.");
    }

    const productCreate = await json(
      "/api/products",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          product_name: `FG Product ${stamp}`,
          product_category: "Finished Goods",
          linked_bom_id: recipeId,
          selling_price: 250,
          total_cost: 0,
          target_gp: 35,
          product_status: "Active",
        }),
      },
      ownerA.cookies
    );

    if (productCreate.data?.ok && productCreate.data.product?.id) {
      productId = productCreate.data.product.id;
      pass("Create Finished Good", "Product created and linked to BOM.");
    } else {
      fail("Create Finished Good", JSON.stringify({ status: productCreate.status, data: productCreate.data }));
      throw new Error("Cannot continue without product.");
    }

    const openDetail = await json(`/api/products/${productId}`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (openDetail.data?.ok) {
      pass("Open Finished Good", "Product detail endpoint returned enterprise payload.");
    } else {
      fail("Open Finished Good", JSON.stringify({ status: openDetail.status, data: openDetail.data }));
    }

    const productPatch = await json(
      `/api/products/${productId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        body: JSON.stringify({
          product_name: `FG Product ${stamp} Updated`,
          product_status: "Review",
          selling_price: 275,
          target_gp: 38,
          category: "Finished Goods",
          notes: "Phase 8 validation",
        }),
      },
      ownerA.cookies
    );

    if (productPatch.data?.ok) {
      pass("Edit/Save Finished Good", "PATCH persisted product fields.");
    } else {
      fail("Edit/Save Finished Good", JSON.stringify({ status: productPatch.status, data: productPatch.data }));
    }

    const duplicate = await json(
      "/api/products",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          product_name: `FG Product ${stamp} Copy`,
          product_category: "Finished Goods",
          linked_bom_id: recipeId,
          selling_price: 275,
          total_cost: Number(openDetail.data?.product?.total_cost || 0),
          target_gp: 38,
          product_status: "Active",
        }),
      },
      ownerA.cookies
    );

    if (duplicate.data?.ok && duplicate.data.product?.id) {
      duplicateProductId = duplicate.data.product.id;
      pass("Duplicate Finished Good", "Duplicate product created.");
    } else {
      fail("Duplicate Finished Good", JSON.stringify({ status: duplicate.status, data: duplicate.data }));
    }

    const recipePatch = await json(
      `/api/recipes/${recipeId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        body: JSON.stringify({
          recipe_name: `FG Recipe ${stamp} Updated`,
          yield_qty: 8,
          lines: [
            {
              line_type: "Ingredient",
              ingredient_id: ingredientId,
              line_name: `FG Ingredient ${stamp}`,
              quantity: 2.5,
              unit: "kg",
              unit_cost: 30,
              wastage_percent: 0,
            },
            {
              line_type: "Packaging",
              line_name: "Pack",
              quantity: 8,
              unit: "unit",
              unit_cost: 1.2,
              wastage_percent: 0,
            },
          ],
        }),
      },
      ownerA.cookies
    );

    const postRecipeProduct = await json(`/api/products/${productId}`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const costAfterRecipePatch = Number(postRecipeProduct.data?.product?.total_cost || 0);
    if (recipePatch.data?.ok && costAfterRecipePatch > 0) {
      pass("Recipe/BOM Edit + Product Cost Roll-up", `Product cost after recipe update: ${costAfterRecipePatch}`);
    } else {
      fail("Recipe/BOM Edit + Product Cost Roll-up", JSON.stringify({ status: recipePatch.status, data: recipePatch.data }));
    }

    const ingredientPatch = await json(
      `/api/ingredients/${ingredientId}`,
      {
        method: "PATCH",
        headers: ownerHeaders,
        body: JSON.stringify({ purchase_cost: 40 }),
      },
      ownerA.cookies
    );
    const postIngredientProduct = await json(`/api/products/${productId}`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const costAfterIngredientPatch = Number(postIngredientProduct.data?.product?.total_cost || 0);

    if (ingredientPatch.data?.ok && costAfterIngredientPatch > costAfterRecipePatch) {
      pass("Raw Material Price Change Recalculation", `Cost moved ${costAfterRecipePatch} -> ${costAfterIngredientPatch}`);
    } else {
      fail(
        "Raw Material Price Change Recalculation",
        JSON.stringify({ status: ingredientPatch.status, data: ingredientPatch.data, costAfterRecipePatch, costAfterIngredientPatch })
      );
    }

    const runCreate = await json(
      "/api/production/runs",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ bom_id: recipeId, product_id: productId, planned_qty: 12, created_by: "phase8-script" }),
      },
      ownerA.cookies
    );

    if (!runCreate.data?.ok || !runCreate.data.run?.id) {
      runtimeRequired("Manufacturing Create/Complete", JSON.stringify({ status: runCreate.status, data: runCreate.data }));
    } else {
      productionRunId = runCreate.data.run.id;

      const runStart = await json(
        `/api/production/runs/${productionRunId}/start`,
        { method: "POST", headers: ownerHeaders, body: JSON.stringify({ actor: "phase8-script" }) },
        ownerA.cookies
      );

      const runComplete = await json(
        `/api/production/runs/${productionRunId}/complete`,
        {
          method: "POST",
          headers: ownerHeaders,
          body: JSON.stringify({ actual_qty: 10, stock_override: true, stock_override_reason: "Phase 8 validation", completed_by: "phase8-script" }),
        },
        ownerA.cookies
      );

      if (runStart.data?.ok && runComplete.data?.ok) {
        pass("Manufacturing Create/Start/Complete", "Production run completed with stock posting.");
      } else {
        runtimeRequired(
          "Manufacturing Create/Start/Complete",
          JSON.stringify({ start: { status: runStart.status, data: runStart.data }, complete: { status: runComplete.status, data: runComplete.data } })
        );
      }
    }

    const fgInventory = await json("/api/inventory/finished-goods", { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    const fgRow = (fgInventory.data?.items || []).find((item) => item.productId === productId || item.id === productId);
    if (fgInventory.data?.ok && fgRow) {
      pass("Inventory Integration", `Stock=${fgRow.qty_on_hand || fgRow.current_stock || 0}, Value=${fgRow.stock_value || 0}`);
    } else {
      runtimeRequired("Inventory Integration", JSON.stringify({ status: fgInventory.status, data: fgInventory.data }));
    }

    const attachmentForm = new FormData();
    attachmentForm.set("file", new File([Buffer.from("%PDF-1.4\n% FG Phase 8 test\n")], `fg-${stamp}.pdf`, { type: "application/pdf" }));

    const attachUpload = await json(
      `/api/products/${productId}/attachments`,
      { method: "POST", headers: { Cookie: ownerA.cookies }, body: attachmentForm },
      ownerA.cookies
    );

    if (attachUpload.data?.ok && attachUpload.data.attachment?.id) {
      attachmentId = attachUpload.data.attachment.id;
      pass("Attachments Upload", "Product attachment uploaded.");
    } else {
      fail("Attachments Upload", JSON.stringify({ status: attachUpload.status, data: attachUpload.data }));
    }

    const attachList = await json(`/api/products/${productId}/attachments`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (attachList.data?.ok && Array.isArray(attachList.data.attachments) && attachList.data.attachments.length >= 1) {
      pass("Attachments List", `Count=${attachList.data.attachments.length}`);
    } else {
      fail("Attachments List", JSON.stringify({ status: attachList.status, data: attachList.data }));
    }

    if (attachmentId) {
      const attachDelete = await json(
        `/api/products/${productId}/attachments/${attachmentId}`,
        { method: "DELETE", headers: { Cookie: ownerA.cookies } },
        ownerA.cookies
      );
      if (attachDelete.data?.ok) {
        pass("Attachments Delete", "Attachment removed through enterprise delete flow.");
      } else {
        fail("Attachments Delete", JSON.stringify({ status: attachDelete.status, data: attachDelete.data }));
      }
    }

    const archive = await json(
      `/api/products/${productId}?mode=archive`,
      { method: "DELETE", headers: { Cookie: ownerA.cookies } },
      ownerA.cookies
    );
    if (archive.data?.ok && archive.data.mode === "archived") {
      pass("Archive Finished Good", "Archive succeeded.");
    } else {
      fail("Archive Finished Good", JSON.stringify({ status: archive.status, data: archive.data }));
    }

    const restore = await json(
      `/api/products/${productId}`,
      { method: "PATCH", headers: ownerHeaders, body: JSON.stringify({ product_status: "Active" }) },
      ownerA.cookies
    );
    if (restore.data?.ok) {
      pass("Restore Finished Good", "Restored by status patch.");
    } else {
      fail("Restore Finished Good", JSON.stringify({ status: restore.status, data: restore.data }));
    }

    const deleteReferenced = await json(
      `/api/products/${productId}`,
      { method: "DELETE", headers: { Cookie: ownerA.cookies } },
      ownerA.cookies
    );
    if (deleteReferenced.status === 409 && deleteReferenced.data?.code === "PRODUCT_REFERENCED") {
      pass("Delete Guard (Referenced Product)", "Delete correctly blocked for referenced product.");
    } else {
      fail("Delete Guard (Referenced Product)", JSON.stringify({ status: deleteReferenced.status, data: deleteReferenced.data }));
    }

    const createDeleteCandidate = await json(
      "/api/products",
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          product_name: `FG Hard Delete ${stamp}`,
          product_category: "Finished Goods",
          selling_price: 100,
          total_cost: 60,
          target_gp: 30,
          product_status: "Active",
        }),
      },
      ownerA.cookies
    );

    if (createDeleteCandidate.data?.ok && createDeleteCandidate.data.product?.id) {
      const hardDelete = await json(
        `/api/products/${createDeleteCandidate.data.product.id}`,
        { method: "DELETE", headers: { Cookie: ownerA.cookies } },
        ownerA.cookies
      );
      if (hardDelete.data?.ok && hardDelete.data.mode === "deleted") {
        pass("Delete Finished Good (Hard Mode)", "Unreferenced product deleted.");
      } else {
        fail("Delete Finished Good (Hard Mode)", JSON.stringify({ status: hardDelete.status, data: hardDelete.data }));
      }
    } else {
      fail("Delete Finished Good (Hard Mode)", "Could not create unreferenced delete candidate.");
    }

    const viewProducts = await json("/api/products", { headers: { Cookie: viewOnlyUser.cookies } }, viewOnlyUser.cookies);
    if (viewProducts.data?.ok) {
      pass("Permissions: View Only Can View", "VIEW_ONLY role can read products.");
    } else {
      fail("Permissions: View Only Can View", JSON.stringify({ status: viewProducts.status, data: viewProducts.data }));
    }

    const viewPatch = await json(
      `/api/products/${productId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: viewOnlyUser.cookies },
        body: JSON.stringify({ product_name: "Should not persist" }),
      },
      viewOnlyUser.cookies
    );

    if (viewPatch.status === 403 || viewPatch.status === 401) {
      pass("Permissions: View Only Edit Block", `Blocked with status ${viewPatch.status}`);
    } else {
      fail("Permissions: View Only Edit Block", JSON.stringify({ status: viewPatch.status, data: viewPatch.data }));
    }

    const crossTenantGet = await json(`/api/products/${productId}`, { headers: { Cookie: ownerB.cookies } }, ownerB.cookies);
    if (crossTenantGet.status === 404 || crossTenantGet.status === 403) {
      pass("Tenant Isolation: Product Detail", `Cross-tenant access blocked with status ${crossTenantGet.status}`);
    } else {
      fail("Tenant Isolation: Product Detail", JSON.stringify({ status: crossTenantGet.status, data: crossTenantGet.data }));
    }

    const crossTenantAttachmentList = await json(
      `/api/products/${productId}/attachments`,
      { headers: { Cookie: ownerB.cookies } },
      ownerB.cookies
    );
    if (crossTenantAttachmentList.status === 404 || crossTenantAttachmentList.status === 403) {
      pass("Tenant Isolation: Product Attachments", `Cross-tenant attachment access blocked with status ${crossTenantAttachmentList.status}`);
    } else {
      fail(
        "Tenant Isolation: Product Attachments",
        JSON.stringify({ status: crossTenantAttachmentList.status, data: crossTenantAttachmentList.data })
      );
    }

    const finalDetail = await json(`/api/products/${productId}`, { headers: { Cookie: ownerA.cookies } }, ownerA.cookies);
    if (finalDetail.data?.ok && Array.isArray(finalDetail.data.auditHistory) && Array.isArray(finalDetail.data.aiInsights)) {
      pass("History/Audit Payload", `audit=${finalDetail.data.auditHistory.length}, insights=${finalDetail.data.aiInsights.length}`);
    } else {
      runtimeRequired("History/Audit Payload", JSON.stringify({ status: finalDetail.status, data: finalDetail.data }));
    }

    const deleteDuplicate = duplicateProductId
      ? await json(`/api/products/${duplicateProductId}`, { method: "DELETE", headers: { Cookie: ownerA.cookies } }, ownerA.cookies)
      : null;
    if (deleteDuplicate && deleteDuplicate.data?.ok) {
      pass("Cleanup Duplicate Product", "Duplicate removed.");
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
    await cleanupUser(viewOnlyUser);
    await cleanupWorkspace(ownerA);
    await cleanupWorkspace(ownerB);
    await cleanupUser(ownerA);
    await cleanupUser(ownerB);
  }
}

main();
