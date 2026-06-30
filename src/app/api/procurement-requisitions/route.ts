import { NextRequest, NextResponse } from "next/server";
import {
  createProcurementRequisition,
  listProcurementRequisitions,
} from "@/lib/vyron-procurement-requisitions";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("procurement");
    await requireWorkspacePermission("procurement.requisitions.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, requisitions: [] });

    const status = request.nextUrl.searchParams.get("status") || undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const requisitions = await listProcurementRequisitions(supabase, companyId, { status, search });
    return NextResponse.json({ ok: true, requisitions });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List requisitions failed.");
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
    await requirePackageFeature("procurement");
    await requireWorkspacePermission("procurement.requisitions.create");
    const companyId = await requireApiCompanyId();
    const requisition = await createProcurementRequisition(supabase, companyId, {
      required_date: body.required_date,
      notes: body.notes,
      created_by: body.created_by,
      lines: Array.isArray(body.lines) ? body.lines : undefined,
      source: body.source,
    });
    return NextResponse.json({ ok: true, requisition });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create requisition failed.");
  }
}
