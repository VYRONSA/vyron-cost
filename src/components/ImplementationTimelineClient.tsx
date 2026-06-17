"use client";

import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const weeks = [
  ["Week 1", "Setup suppliers, ingredients, first BOMs and products."],
  ["Week 2", "Import invoice data, purchase orders and supplier price history."],
  ["Week 3", "Activate recovery approvals, pricing decisions and reporting."],
  ["Week 4", "Board pack, executive review and commercial rollout."],
];

export default function ImplementationTimelineClient() {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Implementation Timeline",
        subtitle: "Premium VYRON COST workflow for implementation timeline.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-5">
            {weeks.map(([week, detail], index) => (
              <div key={week} className="grid gap-4 rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:grid-cols-[90px_1fr]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 text-2xl font-black text-[#65A30D]">{index + 1}</div>
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">{week}</h2>
                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{detail}</p>
                </div>
              </div>
            ))}
          </section>
    </VyronPremiumPageShell>
  );
}
