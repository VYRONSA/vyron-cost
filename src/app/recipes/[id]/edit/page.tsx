import BomBuilderClient from "@/components/BomBuilderClient";
import EditRouteGuard from "@/components/EditRouteGuard";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBomById, getBomIngredients } from "@/lib/vyron-cost-bom-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { useDemo } = await workspaceScope();
  const ingredients = await getBomIngredients();
  const { bom, lines } = useDemo ? await getBomById(id) : { bom: null, lines: [] };
  return (
    <VyronCostAiShell hidePageHeader title={bom ? `Edit ${bom.bom_name}` : "Edit BOM"} subtitle="Update BOM lines, cost, yield, GP and suggested price.">
      <EditRouteGuard permission="edit_recipes">
        <BomBuilderClient ingredients={ingredients} existingBom={bom} existingLines={lines} recipeId={id} />
      </EditRouteGuard>
    </VyronCostAiShell>
  );
}
