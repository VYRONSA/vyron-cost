import AiAssistantClient from "@/components/AiAssistantClient";
import VyronCostShell from "@/components/VyronCostShell";

export default function AiAssistantPage() {
  return (
    <VyronCostShell hidePageHeader title="VYRON AI Assistant" subtitle="Ask profit questions and get rule-based recommendations from live costing data.">
      <AiAssistantClient />
    </VyronCostShell>
  );
}
