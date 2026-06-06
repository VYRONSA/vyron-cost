import ExecutiveTimelineClient from "@/components/ai-financial/ExecutiveTimelineClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";

export default async function ExecutiveTimelinePage() {
  const { timeline } = await getAiFinancialIntelligence();

  return (
    <VyronCostShell title="Executive Timeline" subtitle="SUPPLIERS · COSTS · APPROVALS · RECOVERY · PRODUCTION · INVENTORY">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-violet-700">
        ← AI CFO Command Centre
      </Link>
      <ExecutiveTimelineClient events={timeline} />
    </VyronCostShell>
  );
}
