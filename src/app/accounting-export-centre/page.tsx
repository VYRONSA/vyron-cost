import AccountingExportClient from "@/components/AccountingExportClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function AccountingExportCentrePage() {
  return (
    <VyronCostShell
      title="Accounting Export Centre"
      subtitle="INVOICES · PO · GRN · INVENTORY · PRODUCTION · RECOVERY · COST UPDATES"
    >
      <AccountingExportClient />
    </VyronCostShell>
  );
}
