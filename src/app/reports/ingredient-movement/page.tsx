import IngredientReportClient from "@/components/reports/IngredientReportClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getIngredients } from "@/lib/vyron-cost-data";
import { getReportCompanyName } from "@/lib/vyron-report-context";

export const dynamic = "force-dynamic";

export default async function IngredientMovementReportPage() {
  const [ingredients, companyName] = await Promise.all([getIngredients(1000), getReportCompanyName()]);

  return (
    <VyronCostAiShell hidePageHeader wide title="Ingredient Movement Report" subtitle="INGREDIENT INFLATION, YIELD AND TRUE COST.">
      <IngredientReportClient
        ingredients={ingredients}
        companyName={companyName}
        generatedAt={new Date().toISOString()}
      />
    </VyronCostAiShell>
  );
}
