import DocumentIntelligenceDashboard from "@/components/DocumentIntelligenceDashboard";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function DocumentIntelligencePage() {
  return (
    <VyronCostAiShell hidePageHeader title="Document Intelligence"
      subtitle="CAPTURE SUPPLIER INVOICES, DUPLICATE RISK AND PRICE VARIANCE."
    >
      <DocumentIntelligenceDashboard />
    </VyronCostAiShell>
  );
}
