import Link from "next/link";
import VyronCostShell from "@/components/VyronCostShell";
import { calculateGpPercent, calculateSuggestedPrice, formatMoney, getProducts } from "@/lib/vyron-cost-data";

export default async function PriceOptimizerPage() {
  const products = await getProducts(120);
  const recommendations = products
    .map((product) => {
      const cost = Number(product.total_cost || 0);
      const selling = Number(product.selling_price || 0);
      const targetGp = Number(product.target_gp || 40);
      const gp = calculateGpPercent(selling, cost);
      const suggested = calculateSuggestedPrice(cost, targetGp);
      return { product, gp, suggested, gap: suggested - selling };
    })
    .filter((row) => row.gap > 0 || row.gp < Number(row.product.target_gp || 40))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 20);

  return (
    <VyronCostShell hidePageHeader title="Price Optimizer" subtitle="Recommended selling price actions and GP recovery.">
      <section className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-[#07110d]">Pricing recommendations</h2>
        <div className="mt-5 space-y-3">
          {recommendations.map(({ product, gp, suggested, gap }) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 transition hover:bg-[#A855F7]/10"
            >
              <div>
                <div className="font-black text-[#07110d]">{product.product_name}</div>
                <div className="text-xs text-slate-500">{product.category} · {gp.toFixed(1)}% GP</div>
              </div>
              <div className="text-right">
                <div className="font-black text-[#7E22CE]">{formatMoney(suggested)}</div>
                <div className="text-xs font-bold text-slate-500">+{formatMoney(gap)} opportunity</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </VyronCostShell>
  );
}
