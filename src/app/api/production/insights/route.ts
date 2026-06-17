import { NextRequest, NextResponse } from "next/server";
import { generateProductionInsights } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { manufacturingCompanyContextFromRequest } from "@/lib/vyron-manufacturing-api-context";
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
  try {
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, manufacturingCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, insights: [] }, { headers: { "Cache-Control": "no-store" } });
    const insights = await generateProductionInsights(supabase, companyId);
    return NextResponse.json({ ok: true, insights }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Insights failed.");
  }
}
