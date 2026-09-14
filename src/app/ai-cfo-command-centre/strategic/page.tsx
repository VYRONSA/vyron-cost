import { AiStrategicScenariosClient } from "@/components/ai-financial/AiFinancialModulesClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function AiStrategicModellingPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { strategicScenarios } = await getAiFinancialIntelligence(companyId);

  return (
    <VyronCostShell hidePageHeader title="Strategic Decision Modelling" subtitle="WHAT-IF · PROFITABILITY · RECOVERY · INVENTORY · PRODUCTION">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-blue-700">
        ← AI CFO Command Centre
      </Link>
      <AiStrategicScenariosClient scenarios={strategicScenarios} />
    </VyronCostShell>
  );
}
