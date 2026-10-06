import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getInventorySettings, writeInventoryAudit } from "@/lib/vyron-inventory";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the company's expected interval between production runs (null = not configured). */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireApiCompanyId();
    const settings = await getInventorySettings(supabase, companyId);
    return NextResponse.json({ ok: true, expectedProductionIntervalHours: settings.expectedProductionIntervalHours }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

/** POST { expectedProductionIntervalHours: number | null } — set or clear it (company setting, audited). */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("admin.company");
    const companyId = await requireApiCompanyId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = body.expectedProductionIntervalHours;
    const value = raw === null || raw === undefined || String(raw).trim() === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 24 * 60)) {
      return NextResponse.json({ ok: false, error: "Enter a number of hours greater than 0 (up to 60 days), or leave it blank to switch the warning off." }, { status: 400 });
    }
    const before = await getInventorySettings(supabase, companyId);
    const { error } = await supabase
      .from("vyron_inventory_settings")
      .upsert({ company_id: companyId, expected_production_interval_hours: value, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    if (error) throw new Error(error.message);
    await writeInventoryAudit(supabase, {
      companyId,
      eventType: "Production Cadence Set",
      actor: sessionAuditActor(session),
      fieldName: "expected_production_interval_hours",
      oldValue: before.expectedProductionIntervalHours === null ? undefined : String(before.expectedProductionIntervalHours),
      newValue: value === null ? undefined : String(value),
      detail: value === null ? "Production cadence warning switched off." : `Warn when no production is processed for ${value} hours.`,
    });
    return NextResponse.json({ ok: true, expectedProductionIntervalHours: value });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save failed.");
  }
}
