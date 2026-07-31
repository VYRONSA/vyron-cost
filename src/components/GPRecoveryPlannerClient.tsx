"use client";

import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GPRecoveryPlannerClient({ products }: { products: ProductIntelligenceRow[] }) {
  const rows = products
    .filter((p) => Number(p.gp_gap || 0) > 0)
    .slice(0, 15)
    .map((product) => {
      const units = Number(product.monthly_units_estimate || 100);
      const priceRecovery = Math.max(0, Number(product.suggested_price || 0) - Number(product.selling_price || 0)) * units;
      const costRecovery = Number(product.total_cost || 0) * units * 0.04;
      return { product, units, priceRecovery, costRecovery, total: priceRecovery + costRecovery };
    });

  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        title: "GPRecovery Planner",
        subtitle: "Premium VYRON COST workflow for gprecovery planner.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#A855F7]/10 p-6">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#7E22CE]">Monthly GP Recovery Plan</div>
              <div className="mt-3 text-5xl font-black text-[#7E22CE]">{money(total)}</div>
            </div>
            <div className="grid gap-4">
              {rows.map((row) => (
                <div key={row.product.id} className="rounded-[2rem] bg-white p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-2xl font-black text-[#F8FAFC]">{row.product.product_name}</h3>
                      <p className="text-sm font-bold text-slate-500">GP gap {Number(row.product.gp_gap || 0).toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-[#7E22CE]">{money(row.total)}</div>
                      <div className="text-xs font-bold text-slate-400">monthly recovery</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4"><b>Price recovery:</b> {money(row.priceRecovery)}</div>
                    <div className="rounded-2xl bg-slate-50 p-4"><b>Cost recovery:</b> {money(row.costRecovery)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
