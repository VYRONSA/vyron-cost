import IngredientManagerClient from "@/components/IngredientManagerClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getIngredients, getSuppliers } from "@/lib/vyron-cost-core-data";

export default async function IngredientsPage() {
  const [ingredients, suppliers] = await Promise.all([getIngredients(), getSuppliers()]);
  return (
    <VyronCostAiShell hidePageHeader title="Ingredients" subtitle="Manage ingredient costs, suppliers, yield and price movement.">
      <IngredientManagerClient initialIngredients={ingredients} suppliers={suppliers} />
    </VyronCostAiShell>
  );
}
