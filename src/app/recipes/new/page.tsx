import BomBuilderClient from "@/components/BomBuilderClient";
import EditRouteGuard from "@/components/EditRouteGuard";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getBomIngredients } from "@/lib/vyron-cost-bom-data";

/**
 * New BOM, and Copy & Edit.
 *
 * `copyFrom` names a BOM to prefill the form from. It is a hint only: the
 * builder reads that BOM through the ordinary tenant-scoped API, so an id
 * belonging to another workspace simply is not found. Nothing is written until
 * the user saves, and what is then written is an ordinary new BOM.
 */
export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ copyFrom?: string; copyImage?: string; name?: string }>;
}) {
  const { copyFrom, copyImage, name } = await searchParams;
  const ingredients = await getBomIngredients();
  const isCopy = Boolean(copyFrom);
  return (
    <VyronCostAiShell
      hidePageHeader
      title={isCopy ? "Copy BOM / Recipe" : "New BOM / Recipe"}
      subtitle={
        isCopy
          ? "Start from an existing BOM. Change anything before saving — the original is not affected."
          : "Create a new costing structure from ingredients, packaging, labour, overhead and wastage."
      }
    >
      <EditRouteGuard permission="create_recipes">
        <BomBuilderClient
          ingredients={ingredients}
          copyFromId={copyFrom}
          copyImage={copyImage === "1"}
          copyName={name}
        />
      </EditRouteGuard>
    </VyronCostAiShell>
  );
}
