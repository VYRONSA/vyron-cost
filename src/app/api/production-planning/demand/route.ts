import { NextResponse } from "next/server";
import { getProductionPlanWithBom } from "@/lib/vyron-store-production-planning";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
    const plan = await getProductionPlanWithBom(supabase, companyId);
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Production plan failed.");
  }
}
