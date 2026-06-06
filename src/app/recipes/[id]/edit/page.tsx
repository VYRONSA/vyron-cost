import BomBuilderClient from "@/components/BomBuilderClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBomById, getBomIngredients } from "@/lib/vyron-cost-bom-data";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ bom, lines }, ingredients] = await Promise.all([getBomById(id), getBomIngredients()]);
  return (
    <VyronCostAiShell title={bom ? `Edit ${bom.bom_name}` : "Edit BOM"} subtitle="Update BOM lines, cost, yield, GP and suggested price.">
      <BomBuilderClient ingredients={ingredients} existingBom={bom} existingLines={lines} />
    </VyronCostAiShell>
  );
}
