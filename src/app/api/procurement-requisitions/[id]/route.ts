import { NextRequest, NextResponse } from "next/server";
import {
  getProcurementRequisitionDetail,
  updateProcurementRequisitionStatus,
  type ProcurementRequisitionStatus,
} from "@/lib/vyron-procurement-requisitions";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("procurement");
    await requireWorkspacePermission("procurement.requisitions.view");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const requisition = await getProcurementRequisitionDetail(supabase, companyId, id);
    if (!requisition) {
      return NextResponse.json({ ok: false, error: "Requisition not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, requisition });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load requisition failed.");
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
    await requirePackageFeature("procurement");
    await requireWorkspacePermission("procurement.requisitions.create");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;

    if (body.status) {
      const requisition = await updateProcurementRequisitionStatus(
        supabase,
        companyId,
        id,
        String(body.status) as ProcurementRequisitionStatus
      );
      return NextResponse.json({ ok: true, requisition });
    }

    return NextResponse.json({ ok: false, error: "Unsupported update." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update requisition failed.");
  }
}
