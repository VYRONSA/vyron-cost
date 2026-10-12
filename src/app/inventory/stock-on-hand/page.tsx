import VyronCostAiShell from "@/components/VyronCostAiShell";
import StockOnHandReportClient from "@/components/vyron-cost/inventory/StockOnHandReportClient";
import { getReportCompanyName } from "@/lib/vyron-report-context";
import { todayInSouthAfrica } from "@/lib/vyron-stock-take-rules";

export const dynamic = "force-dynamic";

/**
 * Stock on Hand as at a date. The data is served, scoped and permission checked by
 * /api/inventory/stock-on-hand; this page only frames it.
 */
export default async function StockOnHandReportPage() {
  const companyName = await getReportCompanyName();
  return (
    <VyronCostAiShell hidePageHeader wide title="Stock on Hand" subtitle="RAW MATERIALS AND FINISHED GOODS AS AT ANY DATE.">
      <StockOnHandReportClient companyName={companyName} today={todayInSouthAfrica()} />
    </VyronCostAiShell>
  );
}
