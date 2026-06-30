import { NextRequest, NextResponse } from "next/server";
import {
  createStoreProductionRun,
  listStoreProductionRuns,
} from "@/lib/vyron-store-production-planning";
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
    await requirePackageFeature("production_planning");
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, runs: [] });

    const status = request.nextUrl.searchParams.get("status") || undefined;
    const runs = await listStoreProductionRuns(supabase, companyId, { status });
    if (!runs.length) return NextResponse.json({ ok: true, runs: [] });

    const runIds = runs.map((run) => run.id);
    const { data: lineCounts } = await supabase
      .from("vyron_cost_store_production_run_lines")
      .select("production_run_id")
      .eq("company_id", companyId)
      .in("production_run_id", runIds);

    const countByRun = new Map<string, number>();
    for (const row of lineCounts || []) {
      const id = String(row.production_run_id);
      countByRun.set(id, (countByRun.get(id) || 0) + 1);
    }

    const enriched = runs.map((run) => ({
      ...run,
      product_count: countByRun.get(run.id) || 0,
    }));

    return NextResponse.json({ ok: true, runs: enriched });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List production runs failed.");
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
    await requirePackageFeature("production_planning");
    await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireApiCompanyId();
    const run = await createStoreProductionRun(supabase, companyId, {
      production_date: body.production_date,
      notes: body.notes,
      created_by: body.created_by,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create production run failed.");
  }
}
