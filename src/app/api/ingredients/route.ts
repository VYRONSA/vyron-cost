import { NextRequest, NextResponse } from "next/server";
import { createIngredient, listIngredients } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("ingredients.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, ingredients: [] });
    const ingredients = await listIngredients(supabase, companyId);
    return NextResponse.json({ ok: true, ingredients });
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
    await requireWorkspacePermission("ingredients.create");
    const companyId = await requireApiCompanyId();
    const ingredient = await createIngredient(supabase, companyId, {
      ingredient_name: String(body.ingredient_name || ""),
      category: body.category,
      supplier_id: body.supplier_id,
      purchase_unit: body.purchase_unit,
      recipe_unit: body.recipe_unit,
      purchase_cost: body.purchase_cost,
      previous_cost: body.previous_cost,
      yield_type: body.yield_type,
      yield_percent: body.yield_percent,
      current_alert: body.current_alert,
    });
    return NextResponse.json({ ok: true, ingredient });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
