import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getSalesIntelligence, listCustomerInvoices } from "@/lib/vyron-customer-invoices";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const EMPTY_SALES_REPORT = {
  salesByCustomer: [],
  salesByProduct: [],
  topCustomers: [],
  topProducts: [],
  monthlySales: [],
  invoiceTrends: [],
};

export async function GET() {
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
        products: [],
        manufacturingStats: { batchCount: 0, completedBatches: 0, inProgressBatches: 0, totalOutput: 0, averageYield: 0, varianceValue: 0 },
      });
    }
    const [{ data: products }, mfgStats, salesReport, invoices] = await Promise.all([
      supabase.from("vyron_cost_products").select("id, product_name, category, total_cost, selling_price").eq("company_id", companyId),
      getManufacturingDashboardStats(supabase, companyId),
      getSalesIntelligence(supabase, companyId),
      listCustomerInvoices(supabase, companyId),
    ]);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const monthlyInvoices = invoices.filter((inv) => String(inv.invoice_date) >= monthStart && inv.stock_posted);

    const items = (products || []).map((product) => {
      const currentCost = Number(product.total_cost || 0);
      const sellingPrice = Number(product.selling_price || 0);
      const gpPct = sellingPrice > 0 ? ((sellingPrice - currentCost) / sellingPrice) * 100 : 0;
      const productSales = (salesReport ?? EMPTY_SALES_REPORT).salesByProduct.find((row) => row.product === product.product_name)?.sales || 0;
      const monthlySales = monthlyInvoices
        .filter((inv) => inv.customer_name)
        .reduce((sum, inv) => sum + Number(inv.sales_value || 0), 0);
      const monthlyProfit = productSales > 0 ? productSales * (gpPct / 100) : 0;
      const marginErosion = gpPct < 30;
      return {
        id: product.id,
        product: product.product_name,
        category: product.category,
        currentCost,
        sellingPrice,
        gpPct: Math.round(gpPct * 10) / 10,
        lastManufacturingCost: currentCost,
        monthlySales: productSales || monthlySales / Math.max(1, (products || []).length),
        monthlyProfit: Math.round(monthlyProfit * 100) / 100,
        marginErosion,
      };
    });

    return NextResponse.json({ ok: true, products: items, manufacturingStats: mfgStats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Product intelligence failed.");
  }
}
