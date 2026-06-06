import BomBuilderClient from "@/components/BomBuilderClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBomIngredients } from "@/lib/vyron-cost-bom-data";

export default async function NewRecipePage() {
  const ingredients = await getBomIngredients();
  return (
    <VyronCostAiShell title="New BOM / Recipe" subtitle="Create a new costing structure from ingredients, packaging, labour, overhead and wastage.">
      <BomBuilderClient ingredients={ingredients} />
    </VyronCostAiShell>
  );
}
