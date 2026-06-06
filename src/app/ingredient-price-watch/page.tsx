import IngredientPriceWatchClient from "@/components/IngredientPriceWatchClient";
import VyronCostShell from "@/components/VyronCostShell";
import { getProductIntelligence } from "@/lib/vyron-product-intelligence-data";

export default async function IngredientPriceWatchPage() {
  const products = await getProductIntelligence();

  return (
    <VyronCostShell
      title="Ingredient Price Watch"
      subtitle="PRICE MOVEMENT · EXPOSURE · GP RISK"
    >
      <IngredientPriceWatchClient products={products} />
    </VyronCostShell>
  );
}
