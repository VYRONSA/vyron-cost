import CustomerPriceListReportClient from "@/components/reports/CustomerPriceListReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Customer Price List Report. The data is served, filtered and permission
 * checked by /api/reports/customer-price-list; this page only frames it.
 */
export default async function CustomerPriceListReportPage() {
  const companyName = await getReportCompanyName();
  return (
    <VyronCostAiShell hidePageHeader wide title="Customer Price List Report" subtitle="CUSTOMER ENTITLED PRICES BY PRODUCT.">
      <CustomerPriceListReportClient companyName={companyName} generatedAt={new Date().toISOString()} />
    </VyronCostAiShell>
  );
}
