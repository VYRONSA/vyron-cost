"use client";

import { useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import StatusPill from "@/components/StatusPill";
import { formatMoney, ProductCostLine } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ProductCostingReportClient({ lines }: { lines: ProductCostLine[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return lines;
    return lines.filter((line) =>
      [line.product_name || "", line.line_type, line.line_name, line.unit, line.source_sheet || "", line.raw_row || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [lines, search]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Costing Report",
        subtitle: "Premium VYRON COST workflow for product costing report.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <ReportTableShell
            title="Product Costing Lines Report"
            subtitle="Detailed BOM costing lines for ingredients, packaging, salaries, wastage and overheads."
            search={search}
            onSearch={setSearch}
            resultCount={filtered.length}
          >
            <div className="overflow-x-auto rounded-3xl border border-slate-100">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                  <div>Product</div><div>Type</div><div>Line</div><div>Qty</div><div>Unit</div><div>Unit Cost</div><div>Waste</div><div>Line Cost</div><div>Source</div>
                </div>
                {filtered.map((line) => (
                  <div key={line.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-4 text-sm">
                    <div className="font-black text-[#F8FAFC]">{line.product_name || "Linked Product"}</div>
                    <div><StatusPill tone={line.line_type === "Ingredient" ? "emerald" : line.line_type === "Packaging" ? "amber" : "slate"}>{line.line_type}</StatusPill></div>
                    <div className="font-bold">{line.line_name}</div>
                    <div>{Number(line.quantity || 0).toFixed(3)}</div>
                    <div>{line.unit}</div>
                    <div>{formatMoney(Number(line.unit_cost || 0))}</div>
                    <div>{Number(line.wastage_percent || 0).toFixed(1)}%</div>
                    <div className="font-black text-[#65A30D]">{formatMoney(Number(line.line_cost || line.line_cost_imported || 0))}</div>
                    <div>{line.source_sheet || "Manual"}</div>
                  </div>
                ))}
              </div>
            </div>
          </ReportTableShell>
    </VyronPremiumPageShell>
  );
}
