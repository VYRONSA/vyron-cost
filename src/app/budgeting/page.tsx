import BudgetDashboardClient from "@/components/enterprise/BudgetDashboardClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getBudgetDashboard } from "@/lib/vyron-enterprise-budget";

export default async function BudgetingPage() {
  const dashboard = await getBudgetDashboard();
  return (
    <VyronCostShell title="Budget Dashboard" subtitle="BUDGET VS ACTUAL · MONTHLY · QUARTERLY · ANNUAL">
      <BudgetDashboardClient dashboard={dashboard} />
    </VyronCostShell>
  );
}
