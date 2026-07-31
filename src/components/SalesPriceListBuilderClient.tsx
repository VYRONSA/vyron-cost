"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesPriceListBuilderClient({ products }: { products: ProductIntelligenceRow[] }) {
  const [increase, setIncrease] = useState(6);
  const [customerGroup, setCustomerGroup] = useState("Wholesale Customers");

  const rows = useMemo(
    () =>
      products.slice(0, 25).map((product) => {
        const currentPrice = Number(product.selling_price || 0);
        const suggestedPrice = Math.max(Number(product.suggested_price || 0), currentPrice * (1 + increase / 100));
        const increasePercent = currentPrice > 0 ? ((suggestedPrice - currentPrice) / currentPrice) * 100 : 0;
        return { product, currentPrice, suggestedPrice, increasePercent };
      }),
    [products, increase]
  );

  function downloadCsv() {
    const header = "Product,Category,Current Price,New Price,Increase %\n";
    const body = rows
      .map((row) =>
        [
          row.product.product_name,
          row.product.category,
          row.currentPrice.toFixed(2),
          row.suggestedPrice.toFixed(2),
          row.increasePercent.toFixed(2),
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyron-cost-${customerGroup.toLowerCase().replaceAll(" ", "-")}-price-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Sales Price List Builder",
        subtitle: "Premium VYRON COST workflow for sales price list builder.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <h2 className="text-3xl font-black">Sales Price List Builder</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                Generate customer-facing price lists from suggested prices and GP protection rules.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px_220px]">
                <input value={customerGroup} onChange={(e) => setCustomerGroup(e.target.value)} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-bold outline-none" />
                <input type="number" value={increase} onChange={(e) => setIncrease(Number(e.target.value))} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-bold outline-none" />
                <button onClick={downloadCsv} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-black text-[#F8FAFC]">
                  <Download size={17} /> Download CSV
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-6 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                <div className="col-span-2">Product</div>
                <div>Category</div>
                <div>Current</div>
                <div>New Price</div>
                <div>Increase</div>
              </div>
              {rows.map((row) => (
                <div key={row.product.id} className="grid grid-cols-6 border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2 font-black text-[#F8FAFC]">{row.product.product_name}</div>
                  <div>{row.product.category}</div>
                  <div>{money(row.currentPrice)}</div>
                  <div className="font-black text-[#7E22CE]">{money(row.suggestedPrice)}</div>
                  <div className="font-black text-violet-700">{row.increasePercent.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
