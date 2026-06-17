import { NextRequest, NextResponse } from "next/server";
import { createProductionRun, listProductionRuns } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  manufacturingCompanyContextFromRequest,
  requireManufacturingCompanyId,
} from "@/lib/vyron-manufacturing-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, manufacturingCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, runs: [] }, { headers: { "Cache-Control": "no-store" } });
    const runs = await listProductionRuns(supabase, companyId, { status, search });
    return NextResponse.json({ ok: true, runs }, { headers: { "Cache-Control": "no-store" } });
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
    await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request, body));
    const run = await createProductionRun(supabase, companyId, {
      bom_id: String(body.bom_id || ""),
      product_id: body.product_id || null,
      batch_multiplier: body.batch_multiplier != null ? Number(body.batch_multiplier) : undefined,
      planned_qty: body.planned_qty != null ? Number(body.planned_qty) : undefined,
      notes: body.notes,
      created_by: body.created_by || "user",
      labour: body.labour,
      overhead: body.overhead,
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
