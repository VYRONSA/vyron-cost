import { NextRequest, NextResponse } from "next/server";

import { deleteRecipeComponent, updateRecipeComponent } from "@/lib/vyron-cost-recipes-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; componentId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id, componentId } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("boms.edit");
    const companyId = await requireApiCompanyId();
    const component = await updateRecipeComponent(supabase, companyId, id, componentId, {
      name: body.name,
      component_type: body.component_type,
      sort_order: body.sort_order,
      yield_qty: body.yield_qty,
      yield_unit: body.yield_unit,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, component });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update component failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id, componentId } = await params;

  try {
    await requireWorkspacePermission("boms.delete");
    const companyId = await requireApiCompanyId();
    await deleteRecipeComponent(supabase, companyId, id, componentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete component failed.");
  }
}
