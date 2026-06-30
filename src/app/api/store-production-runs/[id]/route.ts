import { NextRequest, NextResponse } from "next/server";
import { getStoreProductionRunDetail } from "@/lib/vyron-store-production-planning";
import { completeStoreProductionRunInventory } from "@/lib/vyron-inventory-transactions";
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
    await requirePackageFeature("production_planning");
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const run = await getStoreProductionRunDetail(supabase, companyId, id);
    if (!run) return NextResponse.json({ ok: false, error: "Production run not found." }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load production run failed.");
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
    await requirePackageFeature("production_planning");
    await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;

    if (body.action === "complete") {
      const run = await completeStoreProductionRunInventory(
        supabase,
        companyId,
        id,
        body.completed_by || body.actor
      );
      return NextResponse.json({ ok: true, run });
    }

    if (body.status) {
      const { error } = await supabase
        .from("vyron_cost_store_production_runs")
        .update({ status: String(body.status), updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      const run = await getStoreProductionRunDetail(supabase, companyId, id);
      if (!run) return NextResponse.json({ ok: false, error: "Production run not found." }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update production run failed.");
  }
}
