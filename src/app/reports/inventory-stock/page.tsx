import StockValuationReportClient from "@/components/reports/StockValuationReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadStockValuation } from "@/lib/vyron-reports-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function InventoryStockReportsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const [load, companyName] = await Promise.all([loadStockValuation(), getReportCompanyName()]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Complete Stock Valuation" subtitle="STOCK ON HAND AND INVENTORY VALUE.">
      <StockValuationReportClient
        rows={load.data}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
        error={load.error}
        initialType={type === "raw_materials" || type === "finished_goods" || type === "ingredient" || type === "packaging" ? type : undefined}
      />
    </VyronCostAiShell>
  );
}
