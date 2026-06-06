import { Calculator, Gauge, Scale, Wheat } from "lucide-react";
import EnterpriseMetricCard from "@/components/EnterpriseMetricCard";
import VyronCostShell from "@/components/VyronCostShell";
import YieldEngineAdvancedClient from "@/components/YieldEngineAdvancedClient";
import { getIngredients } from "@/lib/vyron-cost-data";

export default async function YieldEnginePage() {
  const ingredients = await getIngredients();

  const nonStandard = ingredients.filter((ingredient) => ingredient.yield_type !== "standard").length;
  const avgYield = ingredients.length
    ? ingredients.reduce((sum, ingredient) => sum + Number(ingredient.yield_percent || 100), 0) / ingredients.length
    : 100;

  return (
    <VyronCostShell
      title="Advanced Yield Engine"
      subtitle="True usable cost engine for cooked yield, prep loss, shrinkage, evaporation and batch conversion."
    >
      <section className="mb-6 grid gap-5 md:grid-cols-4">
        <EnterpriseMetricCard title="Ingredients" value={String(ingredients.length)} note="Ingredients available for yield modelling." icon={Wheat} />
        <EnterpriseMetricCard title="Yield Rules" value={String(nonStandard)} note="Non-standard yield rules." icon={Gauge} />
        <EnterpriseMetricCard title="Average Yield" value={`${avgYield.toFixed(1)}%`} note="Average master yield setting." icon={Scale} />
        <EnterpriseMetricCard title="True Cost" value="Live" note="Calculator updates instantly." icon={Calculator} dark />
      </section>

      <YieldEngineAdvancedClient ingredients={ingredients} />
    </VyronCostShell>
  );
}
