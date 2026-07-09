import VyronCostAiShell from "@/components/VyronCostAiShell";
import CustomerGpReportingClient from "@/components/reports/CustomerGpReportingClient";

export default function CustomerGpReportingPage() {
  return (
    <VyronCostAiShell
      hidePageHeader
      title="Customer GP% Reporting"
      subtitle="POSTED CUSTOMER INVOICE PROFITABILITY ACROSS CUSTOMER, INVOICE, PRODUCT, MONTH, AND YEAR WITH DRILL-DOWN ANALYTICS."
    >
      <CustomerGpReportingClient />
    </VyronCostAiShell>
  );
}
