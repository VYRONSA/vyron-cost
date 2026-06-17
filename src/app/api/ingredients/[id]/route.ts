import { NextRequest, NextResponse } from "next/server";
import { recalculateBomsUsingIngredient } from "@/lib/vyron-cost-ingredient-intelligence";
import { deleteIngredient, updateIngredient } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("ingredients.edit");
    const companyId = await requireApiCompanyId();
    const costFieldsChanged =
      body.purchase_cost !== undefined ||
      body.previous_cost !== undefined ||
      body.yield_percent !== undefined ||
      body.true_unit_cost !== undefined;
    const ingredient = await updateIngredient(supabase, companyId, id, body);
    let cascade = { bomCount: 0, productCount: 0 };
    if (costFieldsChanged) {
      cascade = await recalculateBomsUsingIngredient(supabase, companyId, id);
    }
    return NextResponse.json({ ok: true, ingredient, cascade });
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
    await requireWorkspacePermission("ingredients.delete");
    const companyId = await requireApiCompanyId();
    await deleteIngredient(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
