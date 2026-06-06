import { TrialBalanceClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function TrialBalancePage() {
  const { trialBalance } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="AI Trial Balance Analysis" subtitle="REVENUE · COS · GP · CASH · CREDITORS · DEBTORS · RISKS">
      <FinanceNav />
      <TrialBalanceClient tb={trialBalance} />
    </VyronCostShell>
  );
}
