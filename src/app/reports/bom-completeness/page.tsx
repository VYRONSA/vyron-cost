import { Suspense } from "react";
import BomCompletenessReportClient from "@/components/reports/BomCompletenessReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadBomCompletenessReport } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Finished Goods — BOM Completeness.
 *
 * Served by loadBomCompletenessReport(), which resolves the company from the
 * active workspace, so the report can only ever describe this tenant's finished
 * goods. The sales window is taken from the query string so the period printed
 * on the document is the period the figures were produced for.
 */
export default async function BomCompletenessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from = "", to = "" } = await searchParams;

  const [load, companyName] = await Promise.all([
    loadBomCompletenessReport({ from: from || undefined, to: to || undefined }),
    getReportCompanyName(),
  ]);

  return (
    <VyronCostAiShell
      hidePageHeader
      wide
      title="Finished Goods — BOM Completeness"
      subtitle="BOM AND RECIPE READINESS ACROSS FINISHED GOODS."
    >
      <Suspense fallback={null}>
        <BomCompletenessReportClient
          report={load.data}
          companyName={companyName}
          generatedAt={new Date().toISOString()}
          loadError={load.error}
        />
      </Suspense>
    </VyronCostAiShell>
  );
}
