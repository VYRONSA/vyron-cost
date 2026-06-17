"use client";

import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MarginBridgeClient({ products }: { products: ProductIntelligenceRow[] }) {
  const rows = products.slice(0, 10).map((product) => {
    const currentGp = Number(product.actual_gp || 0);
    const targetGp = Number(product.target_gp || 0);
    const gap = Math.max(0, targetGp - currentGp);
    const monthlyUnits = Number(product.monthly_units_estimate || 100);
    const currentMargin = (Number(product.selling_price || 0) - Number(product.total_cost || 0)) * monthlyUnits;
    const targetMargin = Number(product.selling_price || 0) * (targetGp / 100) * monthlyUnits;
    return { product, currentGp, targetGp, gap, currentMargin, targetMargin, bridge: targetMargin - currentMargin };
  });

  const bridgeTotal = rows.reduce((sum, row) => sum + Math.max(0, row.bridge), 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Margin Bridge",
        subtitle: "Premium VYRON COST workflow for margin bridge.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">Margin Bridge</div>
              <div className="mt-3 text-5xl font-black">{money(bridgeTotal)}</div>
              <p className="mt-3 text-sm font-semibold text-slate-300">Monthly margin required to move products from actual GP to target GP.</p>
            </div>

            <div className="overflow-hidden rounded-[2rem] bg-white">
              <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-[#A3E635]">
                <div className="col-span-2">Product</div>
                <div>Actual GP</div>
                <div>Target GP</div>
                <div>Gap</div>
                <div>Bridge</div>
                <div>Action</div>
              </div>
              {rows.map((row) => (
                <div key={row.product.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2 font-black">{row.product.product_name}</div>
                  <div>{row.currentGp.toFixed(1)}%</div>
                  <div>{row.targetGp.toFixed(1)}%</div>
                  <div className="font-black text-red-700">{row.gap.toFixed(1)}%</div>
                  <div className="font-black text-[#65A30D]">{money(row.bridge)}</div>
                  <div className="text-xs font-bold text-slate-600">Reprice / reduce cost</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
