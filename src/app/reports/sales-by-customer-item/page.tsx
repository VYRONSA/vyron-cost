import SalesByCustomerItemReportClient from "@/components/reports/SalesByCustomerItemReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

/**
 * Sales by Customer / Item / Date. The data is served, filtered and permission
 * checked by /api/reports/sales-by-customer-item; this page only frames it.
 */
export default async function SalesByCustomerItemReportPage() {
  const companyName = await getReportCompanyName();
  return (
    <VyronCostAiShell hidePageHeader wide title="Sales by Customer / Item / Date" subtitle="RECORDED SALES BY CUSTOMER, ITEM AND DATE.">
      <SalesByCustomerItemReportClient companyName={companyName} generatedAt={new Date().toISOString()} />
    </VyronCostAiShell>
  );
}
