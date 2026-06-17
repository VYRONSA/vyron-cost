import { Calculator, ChefHat, ListPlus, Scale } from "lucide-react";
import CostingEngineManager from "@/components/CostingEngineManager";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { formatMoney, getDemoCompanyId, getIngredients, getRecipeItems, getRecipes } from "@/lib/vyron-cost-data";

export default async function CostCalculatorPage() {
  const [recipes, ingredients, recipeItems, companyId] = await Promise.all([
    getRecipes(),
    getIngredients(),
    getRecipeItems(),
    getDemoCompanyId(),
  ]);

  const totalRecipeLines = recipeItems.length;
  const totalValue = recipeItems.reduce((sum, item) => sum + Number(item.line_cost || 0), 0);

  return (
    <VyronCostShell hidePageHeader title="Cost Calculator"
      subtitle="Add, edit and delete recipe costing lines using true yield ingredient costs."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Recipes" value={String(recipes.length)} note="Available for costing" icon={ChefHat} />
        <MetricCard title="Ingredients" value={String(ingredients.length)} note="True yield cost source" icon={Scale} />
        <MetricCard title="Costing Lines" value={String(totalRecipeLines)} note="Editable recipe lines" icon={ListPlus} />
        <MetricCard title="Line Cost Value" value={formatMoney(totalValue)} note="Current recipe line value" icon={Calculator} dark />
      </section>

      <CostingEngineManager recipes={recipes} ingredients={ingredients} initialItems={recipeItems} companyId={companyId} />
    </VyronCostShell>
  );
}
