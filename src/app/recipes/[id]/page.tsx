import RecipeDetailClient from "@/components/RecipeDetailClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBomById } from "@/lib/vyron-cost-bom-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { useDemo } = await workspaceScope();
  const { bom, lines } = useDemo ? await getBomById(id) : { bom: null, lines: [] };

  return (
    <VyronCostAiShell hidePageHeader title={bom?.bom_name || "Recipe / BOM"}
      subtitle="BOM detail with costing lines, GP and suggested batch selling price."
    >
      <RecipeDetailClient recipeId={id} initialBom={bom} initialLines={lines} />
    </VyronCostAiShell>
  );
}
