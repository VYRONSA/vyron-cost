import { Suspense } from "react";
import SalesGpReportClient, { type SalesGpData } from "@/components/reports/SalesGpReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadSalesGpReport } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Customer Sales & GP Report.
 *
 * Reads real customer invoices through getCustomerGpReport(), the same
 * company-scoped engine the export API already uses. The previous page rendered
 * four hard-coded fixture invoices from vyron-cost/manufacturing-data, which
 * showed the same invented figures to every tenant.
 */
export default async function SalesReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from = "", to = "" } = await searchParams;
  const [load, companyName] = await Promise.all([
    loadSalesGpReport({ from: from || undefined, to: to || undefined }),
    getReportCompanyName(),
  ]);

  const report = load.data;
  const data: SalesGpData = {
    metrics: {
      revenue: report?.metrics.revenue ?? 0,
      costOfSales: report?.metrics.costOfSales ?? 0,
      grossProfit: report?.metrics.grossProfit ?? 0,
      gpPct: report?.metrics.gpPct ?? 0,
    },
    invoices: (report?.byInvoice ?? []).map((row) => {
      const sales = Number(row.revenue ?? 0);
      const cost = Number(row.cost ?? 0);
      const gp = Number(row.gp ?? sales - cost);
      return {
        invoiceNumber: String(row.invoiceNumber ?? "—"),
        customerName: String(row.customerName ?? "—"),
        invoiceDate: String(row.invoiceDate ?? "").slice(0, 10),
        sales,
        cost,
        gp,
        gpPct: sales > 0 ? (gp / sales) * 100 : 0,
      };
    }),
  };

  return (
    <VyronCostAiShell hidePageHeader wide title="Customer Sales & GP Report" subtitle="SALES, COST OF SALES AND GROSS PROFIT.">
      <Suspense fallback={null}>
        <SalesGpReportClient
          data={data}
          companyName={companyName}
          generatedAt={new Date().toISOString()}
          from={from}
          to={to}
          error={load.error}
        />
      </Suspense>
    </VyronCostAiShell>
  );
}
