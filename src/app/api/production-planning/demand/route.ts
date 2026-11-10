import { NextResponse } from "next/server";
import { getProductionPlanWithBom } from "@/lib/vyron-store-production-planning";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("production_planning");
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, demand: [], ingredients: [] });
    }
    const params = new URL(request.url).searchParams;
    const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const plan = await getProductionPlanWithBom(supabase, companyId, { requiredFrom: isoDate(params.get("from")), requiredTo: isoDate(params.get("to")) });
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Production plan failed.");
  }
}
