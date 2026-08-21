import SupplierReportClient from "@/components/reports/SupplierReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getSuppliers } from "@/lib/vyron-cost-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function SupplierRiskReportPage() {
  const [suppliers, companyName] = await Promise.all([getSuppliers(500), getReportCompanyName()]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Supplier Risk Report" subtitle="SUPPLIER RISK, MOVEMENT AND INVOICE ROUTING.">
      <SupplierReportClient
        suppliers={suppliers}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
      />
    </VyronCostAiShell>
  );
}
