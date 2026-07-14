import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  buildReportFileName,
  formatMoney,
  formatQty,
  type ReportFilter,
  type TenantReportExportPayload,
} from "@/lib/vyron-report-exports";
import { BrandingService } from "@/lib/platform/branding";
import { getCustomerGpReport, writeReportAudit } from "@/lib/vyron-customer-gp-reporting";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ report: string }> };

function calculateGpPercent(salesValue: number, grossProfit: number) {
  return salesValue > 0 ? (grossProfit / salesValue) * 100 : 0;
}

function parseDateFilters(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") || request.nextUrl.searchParams.get("startDate");
  const to = request.nextUrl.searchParams.get("to") || request.nextUrl.searchParams.get("endDate");

  const filters: ReportFilter[] = [];
  if (from) filters.push({ key: "from", label: "From", value: from });
  if (to) filters.push({ key: "to", label: "To", value: to });

  return { from, to, filters };
}

async function fetchBranding(companyId: string) {
  const branding = await BrandingService.getBrandingByCompanyId(companyId);
  return {
    companyName: branding.companyName,
    tradingName: branding.tradingName,
  };
}

async function buildInventoryExport(
  companyId: string,
  from: string | null,
  to: string | null,
  filters: ReportFilter[]
): Promise<TenantReportExportPayload> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase unavailable.");

  let query = supabase
    .from("vyron_cost_stock_items")
    .select("item_code,description,category,entity_type,unit,qty_on_hand,current_cost,updated_at")
    .eq("company_id", companyId)
    .order("description", { ascending: true });

  if (from) query = query.gte("updated_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("updated_at", `${to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).map((item) => {
    const qty = Number(item.qty_on_hand || 0);
    const cost = Number(item.current_cost || 0);
    return {
      code: String(item.item_code || ""),
      description: String(item.description || ""),
      category: String(item.category || ""),
      type: String(item.entity_type || ""),
      unit: String(item.unit || ""),
      qty,
      unitCost: cost,
      value: qty * cost,
      updatedAt: String(item.updated_at || ""),
    };
  });

  const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const generatedAt = new Date().toISOString();
  const branding = await fetchBranding(companyId);

  return {
    reportKey: "inventory-stock",
    title: "Complete Stock Valuation",
    subtitle: "Raw materials, packaging, finished goods and stock movement valuation.",
    fileName: buildReportFileName("inventory-stock", branding.companyName, generatedAt),
    generatedAt,
    branding,
    filters,
    summary: [
      { label: "Items", value: String(rows.length) },
      { label: "Total Quantity", value: formatQty(totalQty, 2) },
      { label: "Total Value", value: formatMoney(totalValue) },
    ],
    columns: [
      { key: "code", label: "Item Code" },
      { key: "description", label: "Description" },
      { key: "category", label: "Category" },
      { key: "type", label: "Type" },
      { key: "unit", label: "Unit" },
      { key: "qty", label: "Qty On Hand" },
      { key: "unitCost", label: "Unit Cost" },
      { key: "value", label: "Value" },
      { key: "updatedAt", label: "Last Updated" },
    ],
    rows: rows.map((row) => [
      row.code,
      row.description,
      row.category,
      row.type,
      row.unit,
      formatQty(row.qty, 2),
      formatMoney(row.unitCost),
      formatMoney(row.value),
      row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "",
    ]),
  };
}

async function buildManufacturingExport(
  companyId: string,
  from: string | null,
  to: string | null,
  filters: ReportFilter[]
): Promise<TenantReportExportPayload> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase unavailable.");

  let query = supabase
    .from("vyron_cost_production_runs")
    .select("run_number,product_name_snapshot,status,planned_qty,actual_qty,planned_cost,actual_cost,cost_variance_pct,created_at,completed_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).map((run) => ({
    runNumber: String(run.run_number || ""),
    product: String(run.product_name_snapshot || ""),
    status: String(run.status || ""),
    plannedQty: Number(run.planned_qty || 0),
    actualQty: Number(run.actual_qty || 0),
    plannedCost: Number(run.planned_cost || 0),
    actualCost: Number(run.actual_cost || 0),
    variancePct: Number(run.cost_variance_pct || 0),
    completedAt: String(run.completed_at || run.created_at || ""),
  }));

  const totalActual = rows.reduce((sum, row) => sum + row.actualCost, 0);
  const avgVariance = rows.length ? rows.reduce((sum, row) => sum + row.variancePct, 0) / rows.length : 0;
  const generatedAt = new Date().toISOString();
  const branding = await fetchBranding(companyId);

  return {
    reportKey: "manufacturing",
    title: "Manufacturing Reports",
    subtitle: "Batch history, production output and cost variance diagnostics.",
    fileName: buildReportFileName("manufacturing", branding.companyName, generatedAt),
    generatedAt,
    branding,
    filters,
    summary: [
      { label: "Runs", value: String(rows.length) },
      { label: "Total Actual Cost", value: formatMoney(totalActual) },
      { label: "Average Variance", value: `${formatQty(avgVariance, 2)}%` },
    ],
    columns: [
      { key: "runNumber", label: "Batch" },
      { key: "product", label: "Product" },
      { key: "status", label: "Status" },
      { key: "plannedQty", label: "Planned Qty" },
      { key: "actualQty", label: "Actual Qty" },
      { key: "plannedCost", label: "Planned Cost" },
      { key: "actualCost", label: "Actual Cost" },
      { key: "variancePct", label: "Variance %" },
      { key: "completedAt", label: "Date" },
    ],
    rows: rows.map((row) => [
      row.runNumber,
      row.product,
      row.status,
      formatQty(row.plannedQty, 2),
      formatQty(row.actualQty, 2),
      formatMoney(row.plannedCost),
      formatMoney(row.actualCost),
      `${formatQty(row.variancePct, 2)}%`,
      row.completedAt ? new Date(row.completedAt).toLocaleDateString() : "",
    ]),
  };
}

async function buildSalesExport(
  companyId: string,
  from: string | null,
  to: string | null,
  filters: ReportFilter[]
): Promise<TenantReportExportPayload> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase unavailable.");

  let query = supabase
    .from("vyron_customer_invoices")
    .select("invoice_number,customer_name,invoice_date,status,stock_posted,sales_value,cost_value,gross_profit")
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false });

  if (from) query = query.gte("invoice_date", from);
  if (to) query = query.lte("invoice_date", to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || [])
    .filter((invoice) => Boolean(invoice.stock_posted))
    .map((invoice) => {
      const sales = Number(invoice.sales_value || 0);
      const gp = Number(invoice.gross_profit || 0);
      return {
        invoiceNumber: String(invoice.invoice_number || ""),
        customer: String(invoice.customer_name || ""),
        invoiceDate: String(invoice.invoice_date || ""),
        status: String(invoice.status || ""),
        sales,
        cost: Number(invoice.cost_value || 0),
        gp,
        gpPct: calculateGpPercent(sales, gp),
      };
    });

  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const totalGp = rows.reduce((sum, row) => sum + row.gp, 0);
  const avgGpPct = rows.length ? rows.reduce((sum, row) => sum + row.gpPct, 0) / rows.length : 0;
  const generatedAt = new Date().toISOString();
  const branding = await fetchBranding(companyId);

  return {
    reportKey: "sales",
    title: "Customer Sales & GP Reports",
    subtitle: "Posted invoice sales, cost and gross profit performance.",
    fileName: buildReportFileName("sales", branding.companyName, generatedAt),
    generatedAt,
    branding,
    filters,
    summary: [
      { label: "Posted Invoices", value: String(rows.length) },
      { label: "Total Sales", value: formatMoney(totalSales) },
      { label: "Total Cost", value: formatMoney(totalCost) },
      { label: "Total GP", value: formatMoney(totalGp) },
      { label: "Average GP %", value: `${formatQty(avgGpPct, 2)}%` },
    ],
    columns: [
      { key: "invoiceNumber", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "invoiceDate", label: "Date" },
      { key: "status", label: "Status" },
      { key: "sales", label: "Sales" },
      { key: "cost", label: "Cost" },
      { key: "gp", label: "Gross Profit" },
      { key: "gpPct", label: "GP %" },
    ],
    rows: rows.map((row) => [
      row.invoiceNumber,
      row.customer,
      row.invoiceDate,
      row.status,
      formatMoney(row.sales),
      formatMoney(row.cost),
      formatMoney(row.gp),
      `${formatQty(row.gpPct, 2)}%`,
    ]),
  };
}

async function buildCustomerGpExport(
  companyId: string,
  request: NextRequest,
  from: string | null,
  to: string | null,
  filters: ReportFilter[]
): Promise<TenantReportExportPayload> {
  const report = await getCustomerGpReport(getSupabaseAdmin()!, companyId, {
    from,
    to,
    customerId: request.nextUrl.searchParams.get("customerId"),
    customerGroup: request.nextUrl.searchParams.get("customerGroup"),
    salesperson: request.nextUrl.searchParams.get("salesperson"),
    warehouse: request.nextUrl.searchParams.get("warehouse"),
    productId: request.nextUrl.searchParams.get("productId"),
    productCategory: request.nextUrl.searchParams.get("productCategory"),
    priceListId: request.nextUrl.searchParams.get("priceListId"),
    search: request.nextUrl.searchParams.get("search"),
  });

  const generatedAt = new Date().toISOString();
  const branding = await fetchBranding(companyId);

  return {
    reportKey: "customer-gp",
    title: "Customer GP% Reporting",
    subtitle: "Posted customer invoices only. Customer, invoice and product gross profit analysis.",
    fileName: buildReportFileName("customer-gp", branding.companyName, generatedAt),
    generatedAt,
    branding,
    filters,
    summary: [
      { label: "Revenue", value: formatMoney(report.metrics.revenue) },
      { label: "Cost of Sales", value: formatMoney(report.metrics.costOfSales) },
      { label: "Gross Profit", value: formatMoney(report.metrics.grossProfit) },
      { label: "GP %", value: `${formatQty(report.metrics.gpPct, 2)}%` },
      { label: "Margin %", value: `${formatQty(report.metrics.marginPct, 2)}%` },
      { label: "Mark-up %", value: `${formatQty(report.metrics.markupPct, 2)}%` },
      { label: "Quantity Sold", value: formatQty(report.metrics.qtySold, 2) },
      { label: "Average Selling Price", value: formatMoney(report.metrics.avgSellingPrice) },
      { label: "Average Cost Price", value: formatMoney(report.metrics.avgCostPrice) },
    ],
    columns: [
      { key: "customer", label: "Customer" },
      { key: "customerGroup", label: "Customer Group" },
      { key: "invoice", label: "Invoice" },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "salesperson", label: "Salesperson" },
      { key: "warehouse", label: "Warehouse" },
      { key: "revenue", label: "Revenue" },
      { key: "cost", label: "Cost of Sales" },
      { key: "gp", label: "Gross Profit" },
      { key: "gpPct", label: "GP %" },
      { key: "marginPct", label: "Margin %" },
      { key: "markupPct", label: "Mark-up %" },
      { key: "qtySold", label: "Qty Sold" },
      { key: "avgSelling", label: "Avg Selling" },
      { key: "avgCost", label: "Avg Cost" },
    ],
    rows: report.byInvoice.map((row) => [
      row.customerName,
      row.customerGroup,
      row.invoiceNumber,
      row.invoiceDate,
      row.salesperson,
      row.warehouse,
      formatMoney(row.revenue),
      formatMoney(row.cost),
      formatMoney(row.gp),
      `${formatQty(row.gpPct, 2)}%`,
      `${formatQty(row.marginPct, 2)}%`,
      `${formatQty(row.markupPct, 2)}%`,
      formatQty(row.qtySold, 2),
      formatMoney(row.avgSellingPrice),
      formatMoney(row.avgCostPrice),
    ]),
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  if (!getSupabaseAdmin()) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("reports.view");
    await requireWorkspacePermission("reports.export");

    const companyId = await requireApiCompanyId();
    const { report } = await context.params;
    const reportKey = String(report || "").trim().toLowerCase();
    const { from, to, filters } = parseDateFilters(request);

    let payload: TenantReportExportPayload;
    if (reportKey === "inventory-stock") {
      payload = await buildInventoryExport(companyId, from, to, filters);
    } else if (reportKey === "manufacturing") {
      payload = await buildManufacturingExport(companyId, from, to, filters);
    } else if (reportKey === "sales") {
      payload = await buildSalesExport(companyId, from, to, filters);
    } else if (reportKey === "customer-gp") {
      payload = await buildCustomerGpExport(companyId, request, from, to, filters);
    } else {
      return NextResponse.json({ ok: false, error: "Unknown report export type." }, { status: 404 });
    }

    await writeReportAudit(getSupabaseAdmin()!, {
      companyId,
      reportKey,
      eventType: "Report Exported",
      actor: "user",
      detail: `Exported ${reportKey}`,
      metadata: { filters },
    });

    return NextResponse.json({ ok: true, export: payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Report export failed.");
  }
}
