import IngredientEditPageClient from "@/components/IngredientEditPageClient";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { calculateMovementPercent, formatMoney, getIngredientById } from "@/lib/vyron-cost-core-data";

export default async function IngredientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ingredient = await getIngredientById(id);
  if (!ingredient) return <VyronCostAiShell hidePageHeader title="Ingredient Not Found"><div className="rounded-[2rem] bg-white p-8">Ingredient not found.</div></VyronCostAiShell>;
  const movement = calculateMovementPercent(Number(ingredient.previous_cost || 0), Number(ingredient.purchase_cost || 0));
  return (
    <VyronCostAiShell hidePageHeader title={ingredient.ingredient_name} subtitle="Ingredient detail, true cost and movement.">
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Purchase Cost</div><div className="mt-3 text-3xl font-black">{formatMoney(ingredient.purchase_cost)}</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Previous Cost</div><div className="mt-3 text-3xl font-black">{formatMoney(ingredient.previous_cost)}</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">True Unit Cost</div><div className="mt-3 text-3xl font-black text-violet-700">{formatMoney(ingredient.true_unit_cost)}</div></div>
        <div className="rounded-[2rem] bg-white p-6"><div className="text-xs font-black uppercase text-slate-400">Movement</div><div className={`mt-3 text-3xl font-black ${movement > 5 ? "text-red-600" : "text-[#84CC16]"}`}>{movement.toFixed(1)}%</div></div>
      </section>
      <IngredientEditPageClient ingredient={ingredient} />
    </VyronCostAiShell>
  );
}
