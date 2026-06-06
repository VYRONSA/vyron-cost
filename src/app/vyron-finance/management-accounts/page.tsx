import ManagementAccountsClient from "@/components/vyron-finance/ManagementAccountsClient";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function ManagementAccountsPage() {
  const { managementAccounts } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Management Accounts Centre" subtitle="INCOME STATEMENT · BALANCE SHEET · CASH · VARIANCE · RECOVERY">
      <FinanceNav />
      <ManagementAccountsClient data={managementAccounts} />
    </VyronCostShell>
  );
}
