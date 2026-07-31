"use client";

import { useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import StatusPill from "@/components/StatusPill";
import { calculateGpPercent, formatMoney, Product } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ProductMarginReportClient({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return products;
    return products.filter((product) =>
      [product.product_name, product.category, product.status || "", String(product.total_cost), String(product.selling_price)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  return (
    <ReportTableShell
      title="Product Margin Report"
      subtitle="Product-level cost price, selling price, GP percentage and action status."
      search={search}
      onSearch={setSearch}
      resultCount={filtered.length}
    >
      <div className="overflow-x-auto rounded-3xl border border-slate-100">
        <div className="min-w-[1020px]">
          <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
            <div>Product</div><div>Category</div><div>Cost Price</div><div>Selling Price</div><div>Target GP</div><div>Actual GP</div><div>Variance</div><div>Status</div>
          </div>
          {filtered.map((product) => {
            const gp = calculateGpPercent(Number(product.selling_price), Number(product.total_cost));
            const variance = gp - Number(product.target_gp || 0);
            const tone = variance < -5 ? "red" : variance < 0 ? "amber" : "emerald";
            return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Margin Report",
        subtitle: "Premium VYRON COST workflow for product margin report.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={product.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-4 text-sm">
                      <div className="font-black text-[#F8FAFC]">{product.product_name}</div>
                      <div>{product.category}</div>
                      <div>{formatMoney(Number(product.total_cost))}</div>
                      <div>{formatMoney(Number(product.selling_price))}</div>
                      <div>{Number(product.target_gp || 0).toFixed(1)}%</div>
                      <div className="font-black text-[#7E22CE]">{gp.toFixed(1)}%</div>
                      <div>{variance.toFixed(1)}%</div>
                      <div><StatusPill tone={tone}>{tone === "red" ? "Critical" : tone === "amber" ? "Review" : "Healthy"}</StatusPill></div>
                    </div>
    </VyronPremiumPageShell>
  );
          })}
        </div>
      </div>
    </ReportTableShell>
  );
}
