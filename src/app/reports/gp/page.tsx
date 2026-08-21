import { Suspense } from "react";
import CustomerProductGpReportClient, {
  type GpReportData,
} from "@/components/reports/CustomerProductGpReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadSalesGpReport } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

const VIEWS = ["customer", "product", "invoice", "month"] as const;
type View = (typeof VIEWS)[number];

/**
 * Customer & Product GP Report.
 *
 * Every cut is served from getCustomerGpReport(), the existing company-scoped
 * GP engine, so the customer view and the product view of the same period
 * reconcile to the same revenue and gross profit rather than being computed two
 * different ways.
 */
export default async function GpReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>;
}) {
  const { from = "", to = "", view = "customer" } = await searchParams;
  const activeView: View = (VIEWS as readonly string[]).includes(view) ? (view as View) : "customer";

  const [load, companyName] = await Promise.all([
    loadSalesGpReport({ from: from || undefined, to: to || undefined }),
    getReportCompanyName(),
  ]);

  const report = load.data;
  const data: GpReportData = {
    metrics: {
      revenue: report?.metrics.revenue ?? 0,
      costOfSales: report?.metrics.costOfSales ?? 0,
      grossProfit: report?.metrics.grossProfit ?? 0,
      gpPct: report?.metrics.gpPct ?? 0,
      qtySold: report?.metrics.qtySold ?? 0,
    },
    byCustomer: (report?.byCustomer ?? []).map((c) => ({
      customerId: c.customerId ?? null,
      customerName: String(c.customerName || "—"),
      customerGroup: String(c.customerGroup || "Unassigned"),
      revenue: Number(c.revenue || 0),
      cost: Number(c.cost || 0),
      gp: Number(c.gp || 0),
      gpPct: Number(c.gpPct || 0),
      qtySold: Number(c.qtySold || 0),
      invoiceCount: (c.invoices || []).length,
      productCount: (c.products || []).length,
    })),
    byProduct: (report?.byProduct ?? []).map((p) => ({
      productId: p.productId ?? null,
      productName: String(p.productName || "—"),
      category: String(p.category || "Unassigned"),
      qty: Number(p.qty || 0),
      revenue: Number(p.revenue || 0),
      cost: Number(p.cost || 0),
      gp: Number(p.gp || 0),
      gpPct: Number(p.gpPct || 0),
      avgSellingPrice: Number(p.avgSellingPrice || 0),
      avgCostPrice: Number(p.avgCostPrice || 0),
    })),
    byInvoice: (report?.byInvoice ?? []).map((i) => ({
      invoiceNumber: String(i.invoiceNumber || "—"),
      invoiceDate: String(i.invoiceDate || "").slice(0, 10),
      customerName: String(i.customerName || "—"),
      revenue: Number(i.revenue || 0),
      cost: Number(i.cost || 0),
      gp: Number(i.gp || 0),
      gpPct: Number(i.gpPct || 0),
    })),
    byMonth: (report?.byMonth ?? []).map((m) => ({
      month: String(m.month || "—"),
      revenue: Number(m.revenue || 0),
      cost: Number(m.cost || 0),
      gp: Number(m.gp || 0),
      gpPct: Number(m.gpPct || 0),
    })),
  };

  return (
    <VyronCostAiShell
      hidePageHeader
      wide
      title="Customer & Product GP Report"
      subtitle="GROSS PROFIT BY CUSTOMER, PRODUCT, INVOICE AND MONTH."
    >
      <Suspense fallback={null}>
        <CustomerProductGpReportClient
          data={data}
          companyName={companyName}
          generatedAt={new Date().toISOString()}
          from={from}
          to={to}
          view={activeView}
          error={load.error}
        />
      </Suspense>
    </VyronCostAiShell>
  );
}
