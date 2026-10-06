import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { readAllPages } from "@/lib/vyron-supabase-paging";
import { MinimumLevelError, deleteMinimumLevel, listMinimumLevelStatus, saveMinimumLevel } from "@/lib/vyron-stock-minimums";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown, fallback: string) {
  if (error instanceof MinimumLevelError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  return workspaceAccessErrorResponse(error, fallback);
}

/** GET — this company's minimum levels with current stock and status, plus its stock items to choose from. */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireApiCompanyId();
    const [levels, items] = await Promise.all([
      listMinimumLevelStatus(supabase, companyId),
      readAllPages<Record<string, unknown>>((from, to) =>
        supabase.from("vyron_cost_stock_items").select("id, item_code, description, entity_type, unit, qty_on_hand").eq("company_id", companyId).order("description", { ascending: true }).order("id", { ascending: true }).range(from, to)
      ),
    ]);
    return NextResponse.json({ ok: true, levels, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "Load minimum levels failed.");
  }
}

/** POST { stockItemId, minimumQty, warningQty?, criticalQty?, blockProduction? } — set or change one threshold. */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("inventory.minimums.edit");
    const companyId = await requireApiCompanyId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const level = await saveMinimumLevel(
      supabase,
      companyId,
      {
        stockItemId: String(body.stockItemId || ""),
        minimumQty: Number(body.minimumQty),
        warningQty: body.warningQty as number | null | undefined,
        criticalQty: body.criticalQty as number | null | undefined,
        blockProduction: Boolean(body.blockProduction),
      },
      sessionAuditActor(session)
    );
    return NextResponse.json({ ok: true, level });
  } catch (error) {
    return failure(error, "Save minimum level failed.");
  }
}

/** DELETE ?id= — remove a threshold. */
export async function DELETE(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("inventory.minimums.edit");
    const companyId = await requireApiCompanyId();
    const id = new URL(request.url).searchParams.get("id") || "";
    await deleteMinimumLevel(supabase, companyId, id, sessionAuditActor(session));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Remove minimum level failed.");
  }
}
