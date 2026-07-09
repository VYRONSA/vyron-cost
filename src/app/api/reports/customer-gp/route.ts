import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  getCustomerGpReport,
  writeReportAudit,
  type CustomerGpFilters,
} from "@/lib/vyron-customer-gp-reporting";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function readFilters(request: NextRequest): CustomerGpFilters {
  const q = request.nextUrl.searchParams;
  return {
    customerId: q.get("customerId"),
    customerGroup: q.get("customerGroup"),
    salesperson: q.get("salesperson"),
    warehouse: q.get("warehouse"),
    from: q.get("from"),
    to: q.get("to"),
    productId: q.get("productId"),
    productCategory: q.get("productCategory"),
    priceListId: q.get("priceListId"),
    search: q.get("search"),
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("reports.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        report: {
          metrics: {
            revenue: 0,
            costOfSales: 0,
            grossProfit: 0,
            gpPct: 0,
            marginPct: 0,
            markupPct: 0,
            qtySold: 0,
            avgSellingPrice: 0,
            avgCostPrice: 0,
          },
          byCustomer: [],
          byProduct: [],
          byInvoice: [],
          byMonth: [],
          byYear: [],
          topPerformingProducts: [],
          lowestMarginProducts: [],
          lossMakingProducts: [],
          charts: {
            gpTrend: [],
            monthlyGp: [],
            revenueVsCost: [],
            top10CustomersByGp: [],
            top10ProductsByGp: [],
          },
          filtersApplied: readFilters(request),
        },
      });
    }

    const filters = readFilters(request);
    const report = await getCustomerGpReport(supabase, companyId, filters);

    await writeReportAudit(supabase, {
      companyId,
      reportKey: "customer-gp",
      eventType: "Report Viewed",
      actor: "user",
      detail: "Customer GP report generated",
      metadata: {
        filters,
        byCustomer: report.byCustomer.length,
        byInvoice: report.byInvoice.length,
        byProduct: report.byProduct.length,
      },
    });

    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Customer GP report failed.");
  }
}
