import IngredientEditPageClient from "@/components/IngredientEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getDemoCompanyId, getIngredients } from "@/lib/vyron-cost-data";

export default async function EditIngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ingredients, companyId] = await Promise.all([
    getIngredients(),
    getDemoCompanyId(),
  ]);

  const ingredient = ingredients.find((item) => item.id === id) || ingredients[0];

  return (
    <VyronCostShell
      title={`Edit ${ingredient?.ingredient_name || "Ingredient"}`}
      subtitle="Full-page ingredient editing workspace with larger fields, true yield preview and save/delete actions."
    >
      <IngredientEditPageClient ingredient={ingredient} companyId={companyId} />
    </VyronCostShell>
  );
}
