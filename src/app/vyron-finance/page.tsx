import VyronFinanceHubClient from "@/components/vyron-finance/VyronFinanceHubClient";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function VyronFinanceHubPage() {
  const data = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="VYRON FINANCE Intelligence" subtitle="MANAGEMENT ACCOUNTS · STATEMENTS · AUDIT · CASH · HEALTH">
      <FinanceNav />
      <VyronFinanceHubClient data={data} />
    </VyronCostShell>
  );
}
