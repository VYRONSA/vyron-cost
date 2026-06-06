import FinanceStatementsClient from "@/components/vyron-finance/FinanceStatementsClient";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function FinanceStatementsPage() {
  const { statements } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="Financial Statements Workspace" subtitle="INCOME · BALANCE SHEET · CASH FLOW · COMPARATIVES">
      <FinanceNav />
      <FinanceStatementsClient statements={statements} />
    </VyronCostShell>
  );
}
