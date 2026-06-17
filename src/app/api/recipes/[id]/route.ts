import { NextRequest, NextResponse } from "next/server";
import { deleteRecipe, getRecipe, updateRecipe } from "@/lib/vyron-cost-recipes-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("boms.view");
    const companyId = await requireApiCompanyId();
    const recipe = await getRecipe(supabase, companyId, id);
    if (!recipe) return NextResponse.json({ ok: false, error: "Recipe not found." }, { status: 404 });
    return NextResponse.json({ ok: true, recipe });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("boms.edit");
    const companyId = await requireApiCompanyId();
    const { recipe, linkedProducts } = await updateRecipe(supabase, companyId, id, {
      recipe_name: body.recipe_name ?? body.bom_name,
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
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("boms.delete");
    const companyId = await requireApiCompanyId();
    const recipe = await deleteRecipe(supabase, companyId, id);
    return NextResponse.json({ ok: true, recipe });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Archive failed.");
  }
}
