import DocumentHubdocClient from "@/components/DocumentHubdocClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function InvoiceProcessingPage() {
  return (
    <VyronCostAiShell
      title="Invoice Processing"
      subtitle="UPLOAD, EXTRACT, MATCH AND APPROVE SUPPLIER INVOICES."
    >
      <DocumentHubdocClient mode="processing" />
    </VyronCostAiShell>
  );
}
