import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { calcGp, calcLineCost, calcSuggestedPrice, formatMoney, getBomById } from "@/lib/vyron-cost-bom-data";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bom, lines } = await getBomById(id);

  if (!bom) {
    return (
      <VyronCostAiShell title="BOM Not Found" subtitle="This BOM could not be loaded.">
        <div className="rounded-[2rem] bg-white p-8 font-bold text-slate-600">BOM not found.</div>
      </VyronCostAiShell>
    );
  }

  // Meeting rescue calculation rule:
  // The visible Selling Price field on the BOM screen is treated as the total selling price for this BOM/batch.
  // Therefore Actual GP and Suggested Price must use the full BOM total cost, not the cost-per-unit.
  const calculatedTotalCost = lines.reduce((sum, line) => sum + Number(line.line_cost ?? calcLineCost(line)), 0);
  const totalCost = calculatedTotalCost > 0 ? calculatedTotalCost : Number(bom.total_cost || 0);
  const yieldQty = Number(bom.yield_qty || 0);
  const costPerUnit = yieldQty > 0 ? totalCost / yieldQty : totalCost;
  const sellingPrice = Number(bom.selling_price || 0);
  const targetGp = Number(bom.target_gp || 0);
  const actualGp = calcGp(sellingPrice, totalCost);
  const suggestedBatchPrice = calcSuggestedPrice(totalCost, targetGp);

  return (
    <VyronCostAiShell title={bom.bom_name} subtitle="BOM detail with costing lines, GP and suggested batch selling price.">
      <section className="grid gap-5 md:grid-cols-5">
        {[
          ["Total Cost", formatMoney(totalCost), "text-slate-900"],
          ["Cost / Unit", formatMoney(costPerUnit), "text-violet-700"],
          ["Selling Price (Batch)", formatMoney(sellingPrice), "text-slate-900"],
          ["Actual GP", `${actualGp.toFixed(1)}%`, actualGp < targetGp ? "text-red-600" : "text-emerald-600"],
          ["Suggested Batch Price", formatMoney(suggestedBatchPrice), "text-emerald-600"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`mt-3 text-3xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-[2rem] border border-violet-100 bg-violet-50 p-5 text-sm font-black text-violet-900">
        Formula used: Actual GP = (Batch Selling Price - Total BOM Cost) / Batch Selling Price. Suggested Batch Price = Total BOM Cost / (1 - Target GP%).
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">BOM Lines</h2>
          <Link href={`/recipes/${bom.id}/edit`} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">Edit BOM</Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <div>Type</div><div>Name</div><div>Qty</div><div>Unit</div><div>Unit Cost</div><div>Waste</div><div>Line Cost</div>
          </div>
          {lines.map((line) => (
            <div key={line.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-4 text-sm">
              <div className="font-bold text-slate-500">{line.line_type}</div>
              <div className="font-black text-slate-900">{line.line_name}</div>
              <div className="font-bold text-slate-500">{Number(line.quantity || 0).toFixed(4)}</div>
              <div className="font-bold text-slate-500">{line.unit}</div>
              <div className="font-black text-violet-700">{formatMoney(line.unit_cost)}</div>
              <div className="font-bold text-slate-500">{Number(line.wastage_percent || 0).toFixed(1)}%</div>
              <div className="font-black text-slate-900">{formatMoney(line.line_cost ?? calcLineCost(line))}</div>
            </div>
          ))}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
