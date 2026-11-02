import ReorderReportClient from "@/components/reports/ReorderReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadReorderReport } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Low Stock & Minimum Order Levels.
 *
 * Served by loadReorderReport(), which resolves the company from the active
 * workspace, so the report only ever describes this tenant's stock.
 */
export default async function ReorderReportPage() {
  const [load, companyName] = await Promise.all([loadReorderReport(), getReportCompanyName()]);
  return (
    <VyronCostAiShell hidePageHeader wide title="Low Stock & Minimum Order Levels" subtitle="WHAT TO ORDER, HOW MUCH, AND WHY.">
      <ReorderReportClient report={load.data} loadError={load.error} companyName={companyName} />
    </VyronCostAiShell>
  );
}
