import { NextResponse } from "next/server";
import {
  computeProductDemandForecasts,
  getDemandForecastDashboardStats,
  persistDemandForecasts,
} from "@/lib/vyron-demand-forecasting";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
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
    await requirePackageFeature("forecasting");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        forecasts: [],
        stats: {
          forecastRevenue: 0,
          forecastProduction: 0,
          forecastProcurementValue: 0,
          productsGrowingFastest: 0,
          warnings: [],
        },
      });
    }

    const [forecasts, stats] = await Promise.all([
      computeProductDemandForecasts(supabase, companyId),
      getDemandForecastDashboardStats(supabase, companyId),
    ]);

    return NextResponse.json({ ok: true, forecasts, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Demand forecast failed.");
  }
}

export async function POST() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("forecasting");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await requireApiCompanyId();
    const forecasts = await computeProductDemandForecasts(supabase, companyId);
    await persistDemandForecasts(supabase, companyId, forecasts);
    const stats = await getDemandForecastDashboardStats(supabase, companyId);
    return NextResponse.json({ ok: true, forecasts, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Persist demand forecast failed.");
  }
}
