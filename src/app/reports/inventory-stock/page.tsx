import StockValuationReportClient from "@/components/reports/StockValuationReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadStockValuation } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function InventoryStockReportsPage() {
  const [load, companyName] = await Promise.all([loadStockValuation(), getReportCompanyName()]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Complete Stock Valuation" subtitle="STOCK ON HAND AND INVENTORY VALUE.">
      <StockValuationReportClient
        rows={load.data}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
        error={load.error}
      />
    </VyronCostAiShell>
  );
}
