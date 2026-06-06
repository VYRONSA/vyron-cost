import { FoundationClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function VyronFinanceFoundationPage() {
  const { foundation } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="VYRON FINANCE Foundation" subtitle="SHARED ENTITIES · SUPPLIERS · INVENTORY · PURCHASING · AUDIT">
      <FinanceNav />
      <FoundationClient foundation={foundation} />
    </VyronCostShell>
  );
}
