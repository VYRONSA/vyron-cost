import ManufacturingReportClient from "@/components/reports/ManufacturingReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadManufacturingBatches } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function ManufacturingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from = "", to = "" } = await searchParams;
  const [load, companyName] = await Promise.all([
    loadManufacturingBatches({ from: from || undefined, to: to || undefined }),
    getReportCompanyName(),
  ]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Manufacturing Report" subtitle="BATCH HISTORY, YIELD AND PRODUCTION COST.">
      <ManufacturingReportClient
        rows={load.data}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
        from={from}
        to={to}
        error={load.error}
      />
    </VyronCostAiShell>
  );
}
