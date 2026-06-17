import DocumentSupervisorSettings from "@/components/DocumentSupervisorSettings";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function DocumentIntelligenceSettingsPage() {
  return (
    <VyronCostAiShell hidePageHeader title="Supervisor Settings" subtitle="DOCUMENT INTELLIGENCE APPROVAL RULES ENGINE.">
      <DocumentSupervisorSettings />
    </VyronCostAiShell>
  );
}
