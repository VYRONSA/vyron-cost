import PriceHistoryScreen from "@/components/PriceHistoryScreen";
import VyronCostAiShell from "@/components/VyronCostAiShell";

export default function IngredientPriceHistoryPage() {
  return (
    <VyronCostAiShell title="Ingredient Price History" subtitle="INGREDIENT COST CHANGES FROM APPROVED INVOICES.">
      <PriceHistoryScreen scope="ingredient" />
    </VyronCostAiShell>
  );
}
