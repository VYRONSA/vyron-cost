import EditRouteGuard from "@/components/EditRouteGuard";
import IngredientEditPageClient from "@/components/IngredientEditPageClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getIngredientById } from "@/lib/vyron-cost-core-data";
import { notFound } from "next/navigation";

export default async function EditIngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ingredient = await getIngredientById(id);

  if (!ingredient) notFound();

  return (
    <VyronCostShell hidePageHeader title={`Edit ${ingredient.ingredient_name}`}
      subtitle="Full-page ingredient editing workspace with larger fields, true yield preview and save/delete actions."
    >
      <EditRouteGuard permission="edit_ingredients">
        <IngredientEditPageClient ingredient={ingredient} />
      </EditRouteGuard>
    </VyronCostShell>
  );
}
