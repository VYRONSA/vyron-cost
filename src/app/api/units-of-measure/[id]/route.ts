import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  deleteUnitOfMeasure,
  getUnitOfMeasureById,
  updateUnitOfMeasure,
} from "@/lib/vyron-units-of-measure";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("uom.view");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const unit = await getUnitOfMeasureById(supabase, companyId, id);
    if (!unit) return NextResponse.json({ ok: false, error: "Unit of measure not found." }, { status: 404 });
    return NextResponse.json({ ok: true, unit });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Get unit of measure failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("uom.edit");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const unit = await updateUnitOfMeasure(supabase, companyId, id, body || {});
    return NextResponse.json({ ok: true, unit });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update unit of measure failed.");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("uom.delete");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    await deleteUnitOfMeasure(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete unit of measure failed.");
  }
}
