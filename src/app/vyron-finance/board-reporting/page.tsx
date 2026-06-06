import { BoardReportingClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function BoardReportingPage() {
  const { boardPacks } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Boardroom Reporting" subtitle="MONTHLY · MANAGEMENT · PROCUREMENT · RECOVERY · FINANCIAL PACKS">
      <FinanceNav />
      <BoardReportingClient packs={boardPacks} />
    </VyronCostShell>
  );
}
