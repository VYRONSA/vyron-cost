import ProductCostingReportClient from "@/components/reports/ProductCostingReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getProductCostLines } from "@/lib/vyron-cost-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function ProductCostingReportPage() {
  const [lines, companyName] = await Promise.all([getProductCostLines(2000), getReportCompanyName()]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Product Costing Lines Report" subtitle="BOM AND COSTING-LINE REPORT.">
      <ProductCostingReportClient
        lines={lines}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
      />
    </VyronCostAiShell>
  );
}
