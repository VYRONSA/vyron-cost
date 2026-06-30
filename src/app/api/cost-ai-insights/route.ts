import { NextResponse } from "next/server";
import {
  computeCostAiInsights,
  getCostAiInsightDashboard,
  persistCostAiInsights,
} from "@/lib/vyron-cost-ai-insights";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_DASHBOARD = {
  topRisks: [],
  topOpportunities: [],
  marginWatchlist: [],
  supplierWatchlist: [],
  demandWatchlist: [],
  allInsights: [],
  stats: {
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalInsights: 0,
  },
};

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("cost_intelligence");
    await requireWorkspacePermission("reports.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, dashboard: EMPTY_DASHBOARD, insights: [] });
    }

    const dashboard = await getCostAiInsightDashboard(supabase, companyId);
    return NextResponse.json({ ok: true, dashboard, insights: dashboard.allInsights });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Cost AI insights failed.");
  }
}

export async function POST() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("cost_intelligence");
    await requireWorkspacePermission("reports.view");
    const companyId = await requireApiCompanyId();
    const insights = await computeCostAiInsights(supabase, companyId);
    await persistCostAiInsights(supabase, companyId, insights);
    const dashboard = await getCostAiInsightDashboard(supabase, companyId);
    return NextResponse.json({ ok: true, dashboard, insights: dashboard.allInsights });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Persist cost AI insights failed.");
  }
}
