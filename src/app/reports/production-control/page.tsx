import { Suspense } from "react";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import ProductionControlReportClient from "@/components/reports/ProductionControlReportClient";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getReportCompanyName } from "@/lib/vyron-report-context";
import { getProductionControlReport, saDate, type ProductionControlReport, type ProductionView } from "@/lib/vyron-production-control";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Daily Production Control Report. Company from the verified session
 * (requireWorkspacePage); every figure from getProductionControlReport().
 */
export default async function ProductionControlPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; date?: string; from?: string; to?: string; view?: string }>;
}) {
  const { companyId } = await requireWorkspacePage("manufacturing.view");
  const sp = await searchParams;
  const today = saDate(new Date().toISOString())!;
  const mode = sp.mode === "range" ? "range" : "day";
  let from = today;
  let to = today;
  let view: ProductionView = "daily";
  if (mode === "day") {
    from = to = sp.date && DATE.test(sp.date) ? sp.date : today;
  } else {
    view = sp.view === "weekly" || sp.view === "monthly" ? sp.view : "daily";
    from = sp.from && DATE.test(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
    to = sp.to && DATE.test(sp.to) ? sp.to : today;
    if (from > to) [from, to] = [to, from];
  }

  let report: ProductionControlReport | null = null;
  let loadError: string | null = null;
  const supabase = getSupabaseAdmin();
  if (!supabase) loadError = "Reporting service is unavailable.";
  else {
    try {
      report = await getProductionControlReport(supabase, companyId, { from, to, view, today });
    } catch (err) {
      loadError = err instanceof Error ? err.message : "The production control report could not be produced.";
    }
  }
  const companyName = await getReportCompanyName();

  return (
    <VyronCostAiShell hidePageHeader wide title="Daily Production Control Report" subtitle="PRODUCTION SCHEDULE, PLAN ATTAINMENT, MATERIAL READINESS AND EXCEPTIONS.">
      <Suspense fallback={null}>
        <ProductionControlReportClient
          report={report}
          companyName={companyName}
          generatedAt={new Date().toISOString()}
          loadError={loadError}
          mode={mode}
        />
      </Suspense>
    </VyronCostAiShell>
  );
}
