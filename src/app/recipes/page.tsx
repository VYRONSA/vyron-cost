import BomListClient from "@/components/BomListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBoms } from "@/lib/vyron-cost-bom-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export default async function RecipesPage() {
  const { useDemo } = await workspaceScope();
  const boms = useDemo ? await getBoms() : [];
  return (
    <VyronCostAiShell hidePageHeader title="Recipes & BOM" subtitle="Build recipes, BOMs and finished product costing structures.">
      <BomListClient boms={boms} demoSeed={useDemo} />
    </VyronCostAiShell>
  );
}
