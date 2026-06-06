import { AiStrategicScenariosClient } from "@/components/ai-financial/AiFinancialModulesClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function AiStrategicModellingPage() {
  const { strategicScenarios } = await getAiFinancialIntelligence();

  return (
    <VyronCostShell title="Strategic Decision Modelling" subtitle="WHAT-IF · PROFITABILITY · RECOVERY · INVENTORY · PRODUCTION">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-violet-700">
        ← AI CFO Command Centre
      </Link>
      <AiStrategicScenariosClient scenarios={strategicScenarios} />
    </VyronCostShell>
  );
}
