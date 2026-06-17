import CostingLineEditPageClient from "@/components/CostingLineEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import {
  getDemoCompanyId,
  getIngredients,
  getRecipeItems,
  getRecipes,
} from "@/lib/vyron-cost-data";

export default async function EditCostingLinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lines, recipes, ingredients, companyId] = await Promise.all([
    getRecipeItems(),
    getRecipes(),
    getIngredients(),
    getDemoCompanyId(),
  ]);

  const line = lines.find((item) => item.id === id) || lines[0];

  return (
    <VyronCostShell hidePageHeader title={`Edit ${line?.ingredient_name_snapshot || "Costing Line"}`}
      subtitle="Full-page costing line editing workspace for recipe, ingredient, quantity and calculated line cost."
    >
      <CostingLineEditPageClient
        line={line}
        recipes={recipes}
        ingredients={ingredients}
        companyId={companyId}
      />
    </VyronCostShell>
  );
}
