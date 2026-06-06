import { CashFlowClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function CashFlowIntelligencePage() {
  const { cashFlow } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Cash Flow Intelligence" subtitle="30 · 90 · 365 DAYS · SUPPLIERS · INVENTORY · PRODUCTION · RECOVERY">
      <FinanceNav />
      <CashFlowClient cash={cashFlow} />
    </VyronCostShell>
  );
}
