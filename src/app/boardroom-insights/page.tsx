import BoardroomInsightsClient from "@/components/ai-financial/BoardroomInsightsClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getAiFinancialIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import Link from "next/link";
import { requireWorkspacePage } from "@/lib/vyron-workspace-page";

export default async function BoardroomInsightsPage() {
  const { companyId } = await requireWorkspacePage("reports.view");
  const { boardroom } = await getAiFinancialIntelligence(companyId);

  return (
    <VyronCostShell hidePageHeader title="Boardroom Insights" subtitle="TOP RISKS · OPPORTUNITIES · SAVINGS · STRATEGIC ACTIONS">
      <Link href="/ai-cfo-command-centre" className="mb-6 inline-block text-sm font-black text-blue-700">
        ← AI CFO Command Centre
      </Link>
      <BoardroomInsightsClient boardroom={boardroom} />
    </VyronCostShell>
  );
}
