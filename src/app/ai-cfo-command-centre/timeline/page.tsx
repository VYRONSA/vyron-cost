import ExecutiveTimelineClient from "@/components/ai-financial/ExecutiveTimelineClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function ExecutiveTimelinePage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { timeline } = await getAiFinancialIntelligence(companyId);

  return (
    <VyronCostShell hidePageHeader title="Executive Timeline" subtitle="SUPPLIERS · COSTS · APPROVALS · RECOVERY · PRODUCTION · INVENTORY">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-blue-700">
        ← AI CFO Command Centre
      </Link>
      <ExecutiveTimelineClient events={timeline} />
    </VyronCostShell>
  );
}
