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

function workspaceCookieHeader(client, session) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  const sessionValue = encodeURIComponent(JSON.stringify(session));
  return `vyron_cost_active_client=${clientValue}; vyron_workspace_user_session=${sessionValue}`;
}

async function ensureBomSchema() {
  const { error: probeError } = await supabase.from("vyron_cost_boms").select("company_id").limit(1);
  if (!probeError) return;

  if (!String(probeError.message).includes("company_id")) {
    throw probeError;
  }

  const migrationPath = "src/supabase/migrations/20260615_bom_company_scope.sql";
  throw new Error(
    `vyron_cost_boms.company_id is missing. Apply ${migrationPath} in Supabase SQL Editor, then re-run this test.`
  );
}

async function main() {
  await ensureBomSchema();

  const { data: company, error: companyError } = await supabase
    .from("vyron_cost_companies")
    .insert({ name: `Recipes Test ${Date.now()}`, trading_name: "Recipes Test" })
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
      status: "Setup",
      user_limit: 5,
    })
    .select("*")
    .single();
  if (wsError) throw wsError;

  const ownerEmail = `recipes-owner-${Date.now()}@example.com`;
  const ownerPassword = "Recipes123!";

  const ownerPatch = await fetch(`${base}/api/developer/clients/${workspace.id}/owner`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "password",
      admin: { firstName: "Recipes", surname: "Owner", email: ownerEmail, mobile: "0821111111" },
      loginSetup: { method: "password", password: ownerPassword },
    }),
  }).then((r) => r.json());
  if (!ownerPatch.ok) throw new Error(`Owner setup failed: ${ownerPatch.error}`);

  const ownerLogin = await fetch(`${base}/api/workspace/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  }).then((r) => r.json());
  if (!ownerLogin.ok) throw new Error(`Owner login failed: ${ownerLogin.error}`);

  const cookie = workspaceCookieHeader(ownerLogin.client, ownerLogin.session);
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  const createRes = await fetch(`${base}/api/recipes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      recipe_name: "API Test BOM",
      category: "General",
      yield_qty: 10,
      yield_unit: "units",
      target_gp: 40,
      selling_price: 500,
      status: "Draft",
      lines: [
        { line_type: "Ingredient", line_name: "Flour", quantity: 2, unit: "kg", unit_cost: 12, wastage_percent: 2 },
        { line_type: "Packaging", line_name: "Tray", quantity: 10, unit: "unit", unit_cost: 1.5, wastage_percent: 0 },
        { line_type: "Labour", line_name: "Mixing", quantity: 1, unit: "hour", unit_cost: 85, wastage_percent: 0 },
        { line_type: "Overhead", line_name: "Utilities", quantity: 1, unit: "batch", unit_cost: 25, wastage_percent: 0 },
        { line_type: "Wastage", line_name: "Trim loss", quantity: 0.2, unit: "kg", unit_cost: 12, wastage_percent: 0 },
      ],
    }),
  });
  const created = await createRes.json();
  if (!created.ok) throw new Error(`POST /api/recipes failed: ${created.error}`);
  const recipeId = created.recipe.id;
  console.log("POST /api/recipes", "ok", recipeId, "cost_per_unit:", created.recipe.cost_per_unit);

  const listRes = await fetch(`${base}/api/recipes`, { headers: { Cookie: cookie } });
  const list = await listRes.json();
  if (!list.ok || !list.recipes.some((r) => r.id === recipeId)) throw new Error("GET /api/recipes missing created recipe");
  console.log("GET /api/recipes", "ok", list.recipes.length, "recipes");

  const getRes = await fetch(`${base}/api/recipes/${recipeId}`, { headers: { Cookie: cookie } });
  const got = await getRes.json();
  if (!got.ok || got.recipe.lines?.length !== 5) throw new Error("GET /api/recipes/[id] failed");
  console.log("GET /api/recipes/[id]", "ok", got.recipe.lines.length, "lines");

  const patchRes = await fetch(`${base}/api/recipes/${recipeId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ recipe_name: "API Test BOM Updated", target_gp: 45, status: "Approved" }),
  });
  const patched = await patchRes.json();
  if (!patched.ok || patched.recipe.recipe_name !== "API Test BOM Updated") throw new Error("PATCH /api/recipes/[id] failed");
  console.log("PATCH /api/recipes/[id]", "ok", patched.recipe.suggested_selling_price);

  const lineRes = await fetch(`${base}/api/recipes/${recipeId}/lines`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      line_type: "Ingredient",
      line_name: "Sugar",
      quantity: 1,
      unit: "kg",
      unit_cost: 18,
      wastage_percent: 1,
    }),
  });
  const line = await lineRes.json();
  if (!line.ok) throw new Error(`POST lines failed: ${line.error}`);
  console.log("POST /api/recipes/[id]/lines", "ok", line.line.id);

  const linesRes = await fetch(`${base}/api/recipes/${recipeId}/lines`, { headers: { Cookie: cookie } });
  const lines = await linesRes.json();
  if (!lines.ok || lines.lines.length < 6) throw new Error("GET lines failed");
  console.log("GET /api/recipes/[id]/lines", "ok", lines.lines.length, "lines");

  const lineId = line.line.id;
  const patchLineRes = await fetch(`${base}/api/recipes/${recipeId}/lines/${lineId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ quantity: 2 }),
  });
  const patchLine = await patchLineRes.json();
  if (!patchLine.ok) throw new Error(`PATCH line failed: ${patchLine.error}`);
  console.log("PATCH /api/recipes/[id]/lines/[lineId]", "ok");

  const delLineRes = await fetch(`${base}/api/recipes/${recipeId}/lines/${lineId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  const delLine = await delLineRes.json();
  if (!delLine.ok) throw new Error("DELETE line failed");
  console.log("DELETE /api/recipes/[id]/lines/[lineId]", "ok");

  const delRes = await fetch(`${base}/api/recipes/${recipeId}`, { method: "DELETE", headers: { Cookie: cookie } });
  const deleted = await delRes.json();
  if (!deleted.ok || deleted.recipe.status !== "Archived") throw new Error("DELETE /api/recipes/[id] failed");
  console.log("DELETE /api/recipes/[id]", "ok archived");

  console.log("PASS: all recipe API routes verified");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
