import VyronCostAiShell from "@/components/VyronCostAiShell";
import CostIntelligenceExecutiveClient from "@/components/vyron-cost/intelligence/CostIntelligenceExecutiveClient";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";

export default async function CostIntelligencePage() {
  const workspace = await getServerActiveWorkspace();
  const companyName = workspace?.companyName || workspace?.tradingName || "Your company";

  return (
    <VyronCostAiShell
      hidePageHeader
      title="Cost Intelligence Command Centre"
      subtitle="Deterministic insights from demand, margin, supplier, inventory and procurement data."
    >
      <CostIntelligenceExecutiveClient companyName={companyName} />
    </VyronCostAiShell>
  );
}
