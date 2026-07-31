"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PricingApprovalCentreClient({ products }: { products: ProductIntelligenceRow[] }) {
  const [decisions, setDecisions] = useState<Record<string, "Approved" | "Rejected" | "Pending">>({});

  const rows = useMemo(
    () =>
      products
        .filter((product) => Number(product.suggested_price || 0) > Number(product.selling_price || 0))
        .slice(0, 20)
        .map((product) => {
          const increase = Number(product.suggested_price || 0) - Number(product.selling_price || 0);
          const units = Number(product.monthly_units_estimate || 100);
          return {
            ...product,
            increase,
            monthlyImpact: increase * units,
            annualImpact: increase * units * 12,
            decision: decisions[product.id] || "Pending",
          };
        }),
    [products, decisions]
  );

  const approvedMonthly = rows
    .filter((row) => row.decision === "Approved")
    .reduce((sum, row) => sum + row.monthlyImpact, 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Pricing Approval Centre",
        subtitle: "Premium VYRON COST workflow for pricing approval centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pending Price Decisions</div>
                <div className="mt-3 text-4xl font-black text-[var(--vyron-warning-fg)]">{rows.filter((row) => row.decision === "Pending").length}</div>
              </div>
              <div className="rounded-[2rem] bg-[#A855F7]/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#7E22CE]">Approved Monthly Impact</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">{money(approvedMonthly)}</div>
              </div>
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Annualised</div>
                <div className="mt-3 text-4xl font-black">{money(approvedMonthly * 12)}</div>
              </div>
            </section>

            <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-10 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                  <div className="col-span-2">Product</div>
                  <div>Current</div>
                  <div>Suggested</div>
                  <div>Increase</div>
                  <div>GP Gap</div>
                  <div>Monthly</div>
                  <div>Annual</div>
                  <div>Status</div>
                  <div>Decision</div>
                </div>

                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-10 items-center border-t border-slate-100 px-5 py-5 text-sm">
                    <div className="col-span-2">
                      <div className="font-black text-[#F8FAFC]">{row.product_name}</div>
                      <div className="text-xs text-slate-500">{row.category}</div>
                    </div>
                    <div>{money(row.selling_price)}</div>
                    <div className="font-black text-[#7E22CE]">{money(row.suggested_price)}</div>
                    <div>{money(row.increase)}</div>
                    <div className="font-black text-red-700">{Number(row.gp_gap || 0).toFixed(1)}%</div>
                    <div className="font-black text-[#7E22CE]">{money(row.monthlyImpact)}</div>
                    <div>{money(row.annualImpact)}</div>
                    <div><StatusPill tone={row.decision === "Approved" ? "emerald" : row.decision === "Rejected" ? "red" : "amber"}>{row.decision}</StatusPill></div>
                    <div className="flex gap-2">
                      <button onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Approved" }))} className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 p-2 text-[#7E22CE]"><CheckCircle2 size={16} /></button>
                      <button onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Rejected" }))} className="rounded-full bg-red-50 p-2 text-red-700"><XCircle size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
