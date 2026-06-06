import { FinancialReviewClient } from "@/components/vyron-finance/VyronFinanceModuleClients";
import { FinanceNav } from "@/components/vyron-finance/VyronFinanceShared";
import VyronCostShell from "@/components/VyronCostShell";
import { getVyronFinanceIntelligence } from "@/lib/vyron-finance-intelligence-layer";

export default async function FinancialReviewPage() {
  const { financialReview } = await getVyronFinanceIntelligence();
  return (
    <VyronCostShell title="AI Financial Review" subtitle="UNUSUAL MOVEMENTS · MARGIN · SPEND · INVENTORY · CASH">
      <FinanceNav />
      <FinancialReviewClient insights={financialReview} />
    </VyronCostShell>
  );
}
