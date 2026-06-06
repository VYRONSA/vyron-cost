import InvoiceExceptionCentreClient from "@/components/InvoiceExceptionCentreClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getInvoiceRiskFindings } from "@/lib/vyron-leakage-intelligence-data";

export default async function InvoiceExceptionCentrePage() {
  const invoices = await getInvoiceRiskFindings();

  return (
    <VyronCostShell
      title="Invoice Exception Centre"
      subtitle="DUPLICATES · SPLITTING · UNUSUAL VALUES · PAYMENT HOLDS"
    >
      <InvoiceExceptionCentreClient invoices={invoices} />
    </VyronCostShell>
  );
}
