import { NextRequest, NextResponse } from "next/server";
import { createRecipe, listRecipeCategories, listRecipes } from "@/lib/vyron-cost-recipes-data";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("boms.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, recipes: [], categories: [] });

    /**
     * Filters are read from the query string, but the tenant is not: companyId
     * still comes from the verified workspace, so a filter can only ever narrow
     * the caller's own recipes.
     */
    const params = request.nextUrl.searchParams;
    const [recipes, categories] = await Promise.all([
      listRecipes(supabase, companyId, false, {
        name: params.get("name") ?? undefined,
        category: params.get("category") ?? undefined,
        description: params.get("description") ?? undefined,
      }),
      // Options describe the whole library, so they stay stable while filtering.
      listRecipeCategories(supabase, companyId),
    ]);
    return NextResponse.json({ ok: true, recipes, categories });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("boms.create");
    const companyId = await requireApiCompanyId();
    const { recipe, linkedProducts } = await createRecipe(supabase, companyId, {
      recipe_name: String(body.recipe_name || body.bom_name || ""),
      category: body.category,
      yield_qty: body.yield_qty,
      yield_unit: body.yield_unit,
      target_gp: body.target_gp,
      selling_price: body.selling_price,
      status: body.status,
      notes: body.notes,
      product_id: body.product_id,
      lines: body.lines,
    });
    return NextResponse.json({ ok: true, recipe, linkedProducts });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
