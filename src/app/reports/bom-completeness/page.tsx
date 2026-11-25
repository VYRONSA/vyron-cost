import { Suspense } from "react";
import BomCompletenessReportClient from "@/components/reports/BomCompletenessReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadBomCompletenessReport } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";
import { BOM_OVERRIDE_PERMISSION } from "@/lib/vyron-bom-completeness-overrides";

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

  const [load, companyName, session] = await Promise.all([
    loadBomCompletenessReport({ from: from || undefined, to: to || undefined }),
    getReportCompanyName(),
    getServerWorkspaceSession().catch(() => null),
  ]);
  // Display only: the override API enforces the same permission on every write.
  const canOverride = !!session && sessionHasPermission(session, BOM_OVERRIDE_PERMISSION);

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
          canOverride={canOverride}
        />
      </Suspense>
    </VyronCostAiShell>
  );
}
