"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

type Variance = {
  id: string;
  run_number: string;
  bom_name_snapshot: string;
  planned_cost: number;
  actual_cost: number;
  cost_variance_pct: number;
  planned_qty: number;
  actual_qty: number;
  yield_pct: number;
  yield_status: string | null;
  planned_usage_value: number;
  actual_usage_value: number;
  usage_variance_pct: number;
  production_efficiency_pct: number;
};

export default function ProductionVariancesClient() {
  const [rows, setRows] = useState<Variance[]>([]);

  useEffect(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/production/variances${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.variances);
      });
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        badge: "Production Variance",
        title: "Production Variance Command Centre",
        subtitle: "Track run-level manufacturing variance, yield performance, and efficiency exceptions.",
        outcomes: ["Spot adverse cost variance fast", "Compare planned versus actual yield", "Prioritize corrective production action"],
        formulas: ["Cost Variance % = (Actual - Planned) / Planned", "Yield % = Actual Qty / Planned Qty", "Efficiency % = Production output efficiency index"],
        intelligenceItems: [
          { label: "Variance runs", detail: `${rows.length} manufacturing runs in current variance view` },
          { label: "Drilldown", detail: "Each row links directly to detailed production run review" },
          { label: "Coverage", detail: "Cost, usage, yield, and efficiency metrics shown together" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-10 bg-[#07110d] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#A855F7]">
            <div>Run</div>
            <div className="col-span-2">Recipe</div>
            <div>Planned cost</div>
            <div>Actual cost</div>
            <div>Cost var %</div>
            <div>Planned yield</div>
            <div>Actual yield</div>
            <div>Usage var %</div>
            <div>Efficiency</div>
          </div>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/manufacturing/runs/${r.id}`}
              className="grid grid-cols-10 items-center border-t px-4 py-3 text-sm hover:bg-violet-50/30"
            >
              <div className="font-black text-violet-800">{r.run_number}</div>
              <div className="col-span-2 font-bold">{r.bom_name_snapshot}</div>
              <div>{formatMoney(r.planned_cost)}</div>
              <div>{formatMoney(r.actual_cost)}</div>
              <div className={Math.abs(r.cost_variance_pct) >= 10 ? "font-black text-red-600" : ""}>{r.cost_variance_pct}%</div>
              <div>{r.planned_qty}</div>
              <div>
                {r.actual_qty} ({r.yield_pct}%)
              </div>
              <div>{r.usage_variance_pct}%</div>
              <div>{r.production_efficiency_pct}%</div>
            </Link>
          ))}
        </div>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
