import { AiBudgetActualClient } from "@/components/ai-financial/AiFinancialModulesClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function AiBudgetIntelligencePage() {
  const { budgetActual } = await getAiFinancialIntelligence();

  return (
    <VyronCostShell title="Budget vs Actual Intelligence" subtitle="VARIANCE · TREND · ROOT CAUSE · AI RECOMMENDATIONS">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-violet-700">
        ← AI CFO Command Centre
      </Link>
      <AiBudgetActualClient rows={budgetActual} />
    </VyronCostShell>
  );
}
