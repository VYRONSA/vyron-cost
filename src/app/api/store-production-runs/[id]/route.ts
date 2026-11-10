import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getStoreProductionRunDetail, nextStoreProductionStatuses, type StoreProductionStatus } from "@/lib/vyron-store-production-planning";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
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
    const session = await requireWorkspacePermission("manufacturing.runs.create");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;

    if (body.action === "complete") {
      const run = await completeStoreProductionRunInventory(
        supabase,
        companyId,
        id,
        await memberDisplayName(supabase, session)
      );
      return NextResponse.json({ ok: true, run });
    }

    if (body.status || body.production_date) {
      const current = await getStoreProductionRunDetail(supabase, companyId, id);
      if (!current) return NextResponse.json({ ok: false, error: "Production run not found." }, { status: 404 });
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const changes: string[] = [];
      if (body.status) {
        const to = String(body.status);
        // Status tracking follows the run's lifecycle; Completed only through "complete" (which posts stock).
        if (!nextStoreProductionStatuses(current.status).includes(to as StoreProductionStatus))
          return NextResponse.json({ ok: false, error: `A ${current.status} run cannot move to ${to.slice(0, 40)}.` }, { status: 409 });
        patch.status = to;
        changes.push(`status ${current.status} → ${to}`);
      }
      if (body.production_date) {
        const date = String(body.production_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
          return NextResponse.json({ ok: false, error: "Planned production date must be a valid date (YYYY-MM-DD)." }, { status: 400 });
        if (!["Draft", "Planned"].includes(current.status))
          return NextResponse.json({ ok: false, error: `The planned date of a ${current.status} run cannot be changed.` }, { status: 409 });
        patch.production_date = date;
        changes.push(`planned date ${current.production_date} → ${date}`);
      }
      const { data: updated, error } = await supabase
        .from("vyron_cost_store_production_runs")
        .update(patch)
        .eq("company_id", companyId)
        .eq("id", id)
        .eq("status", current.status)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) return NextResponse.json({ ok: false, error: "The run changed while you were updating it. Reload and try again." }, { status: 409 });
      await writeInventoryAudit(supabase, {
        companyId,
        eventType: "store_production_run_updated",
        actor: await memberDisplayName(supabase, session),
        fieldName: body.status ? "status" : "production_date",
        oldValue: body.status ? current.status : current.production_date,
        newValue: String(body.status || body.production_date),
        detail: `${current.run_number}: ${changes.join("; ")}`,
        referenceType: "store_production_run",
        referenceId: id,
      });
      const run = await getStoreProductionRunDetail(supabase, companyId, id);
      if (!run) return NextResponse.json({ ok: false, error: "Production run not found." }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update production run failed.");
  }
}
