"use client";

import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function UnitEconomicsDashboardClient({ products }: { products: ProductIntelligenceRow[] }) {
  const rows = products.slice(0, 15).map((product) => {
    const unitProfit = Number(product.selling_price || 0) - Number(product.total_cost || 0);
    const gp = Number(product.actual_gp || 0);
    return { product, unitProfit, gp };
  });

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-[2rem] bg-white">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-emerald-300">
          <div className="col-span-2">Product</div>
          <div>Selling</div>
          <div>Cost</div>
          <div>Unit Profit</div>
          <div>GP</div>
          <div>Monthly Units</div>
        </div>
        {rows.map((row) => (
          <div key={row.product.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-5 text-sm">
            <div className="col-span-2 font-black">{row.product.product_name}</div>
            <div>{money(row.product.selling_price)}</div>
            <div>{money(row.product.total_cost)}</div>
            <div className="font-black text-emerald-700">{money(row.unitProfit)}</div>
            <div>{row.gp.toFixed(1)}%</div>
            <div>{Number(row.product.monthly_units_estimate || 0).toFixed(0)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
