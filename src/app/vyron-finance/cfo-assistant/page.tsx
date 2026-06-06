import CfoAssistantClient from "@/components/vyron-finance/CfoAssistantClient";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function CfoAssistantPage() {
  const { cfoAssistantPresets } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="AI CFO Assistant" subtitle="EXPLAINABLE · DATA-DRIVEN · FORMULA · CONFIDENCE">
      <FinanceNav />
      <CfoAssistantClient presets={cfoAssistantPresets} />
    </VyronCostShell>
  );
}
