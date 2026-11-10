import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  AGREED_INFLATION_BASELINE,
  InflationBaselineError,
  buildInflationReview,
  commitInflationBaseline,
  getInflationBaseline,
  isIsoDay,
  listInflationBaselineEvents,
  loadPriceHistoryForInflation,
} from "@/lib/vyron-inflation-baseline";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?baseline=YYYY-MM-DD — review (and impact preview) of inflation re-based on that date. Writes nothing. */
export async function GET(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("suppliers.view");
    const companyId = await requireApiCompanyId();
    const [current, events, rows] = await Promise.all([
      getInflationBaseline(supabase, companyId),
      listInflationBaselineEvents(supabase, companyId),
      loadPriceHistoryForInflation(supabase, companyId),
    ]);
    const asked = new URL(request.url).searchParams.get("baseline");
    const proposed = isIsoDay(asked) ? asked : current || AGREED_INFLATION_BASELINE;
    return NextResponse.json(
      {
        ok: true,
        currentBaseline: current,
        agreedBaseline: AGREED_INFLATION_BASELINE,
        review: buildInflationReview(rows, proposed),
        events,
        canManage: sessionHasPermission(session, "admin.company"),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Inflation review failed.");
  }
}

/** POST { action: "set" | "remove", baseline?, reason } — admin.company. Recorded in the audit log with the impact. */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("admin.company");
    const companyId = await requireApiCompanyId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await commitInflationBaseline(supabase, companyId, {
      action: body.action === "remove" ? "remove" : "set",
      baseline: typeof body.baseline === "string" ? body.baseline : undefined,
      reason: String(body.reason || ""),
      actor: await memberDisplayName(supabase, session),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InflationBaselineError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Inflation baseline change failed.");
  }
}
