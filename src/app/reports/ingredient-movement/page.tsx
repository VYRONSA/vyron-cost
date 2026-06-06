import IngredientReportClient from "@/components/reports/IngredientReportClient";
import MetricCard from "@/components/MetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import { Boxes, Gauge, Leaf, TrendingUp } from "lucide-react";
import { calculateMovementPercent, formatMoney, getIngredients } from "@/lib/vyron-cost-data";

export default async function IngredientMovementReportPage() {
  const ingredients = await getIngredients();
  const highMovement = ingredients.filter((ingredient) => calculateMovementPercent(Number(ingredient.previous_cost), Number(ingredient.purchase_cost)) > 5).length;
  const totalTrueCost = ingredients.reduce((sum, ingredient) => sum + Number(ingredient.true_unit_cost || 0), 0);
  const yieldRules = ingredients.filter((ingredient) => ingredient.yield_type !== "standard").length;

  return (
    <VyronCostShell title="Ingredient Movement Report" subtitle="Dedicated ingredient inflation, yield and true-cost report.">
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <MetricCard title="Ingredients" value={String(ingredients.length)} note="Total ingredients" icon={Boxes} />
        <MetricCard title="Inflation Watch" value={String(highMovement)} note="Above 5% movement" icon={TrendingUp} />
        <MetricCard title="Yield Rules" value={String(yieldRules)} note="Non-standard yield items" icon={Gauge} />
        <MetricCard title="True Cost Value" value={formatMoney(totalTrueCost)} note="Combined true cost reference" icon={Leaf} dark />
      </section>
      <IngredientReportClient ingredients={ingredients} />
    </VyronCostShell>
  );
}
