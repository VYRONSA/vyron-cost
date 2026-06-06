import { ExecutiveFinanceClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function ExecutiveFinancialDashboardPage() {
  const data = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Executive Financial Dashboard" subtitle="REVENUE · GP · PROFIT · INVENTORY · CASH · RECOVERY · HEALTH">
      <FinanceNav />
      <ExecutiveFinanceClient data={data} />
    </VyronCostShell>
  );
}
