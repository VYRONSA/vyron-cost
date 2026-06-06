import BomListClient from "@/components/BomListClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBoms } from "@/lib/vyron-cost-bom-data";

export default async function RecipesPage() {
  const boms = await getBoms();
  return (
    <VyronCostAiShell title="Recipes & BOM" subtitle="Build recipes, BOMs and finished product costing structures.">
      <BomListClient boms={boms} />
    </VyronCostAiShell>
  );
}
