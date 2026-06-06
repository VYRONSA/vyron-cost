import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSalesIntelligence } from "@/lib/vyron-customer-invoices";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { listCustomerInvoices } from "@/lib/vyron-customer-invoices";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const [{ data: products }, mfgStats, salesReport, invoices] = await Promise.all([
      supabase.from("vyron_cost_products").select("id, product_name, category, total_cost, selling_price").eq("company_id", VYRON_DEFAULT_TENANT_ID),
      getManufacturingDashboardStats(supabase, VYRON_DEFAULT_TENANT_ID),
      getSalesIntelligence(supabase, VYRON_DEFAULT_TENANT_ID),
      listCustomerInvoices(supabase, VYRON_DEFAULT_TENANT_ID),
    ]);

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const monthlyInvoices = invoices.filter((inv) => String(inv.invoice_date) >= monthStart && inv.stock_posted);

    const items = (products || []).map((product) => {
      const currentCost = Number(product.total_cost || 0);
      const sellingPrice = Number(product.selling_price || 0);
      const gpPct = sellingPrice > 0 ? ((sellingPrice - currentCost) / sellingPrice) * 100 : 0;
      const productSales = salesReport.salesByProduct.find((row) => row.product === product.product_name)?.sales || 0;
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Product intelligence failed." }, { status: 500 });
  }
}
