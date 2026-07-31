"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const checks = [
  "Product has linked BOM",
  "Ingredient cost checked",
  "Packaging cost checked",
  "Labour and overhead included",
  "Target GP set",
  "Suggested price reviewed",
  "Supplier movement reviewed",
  "Product approved for selling",
];

export default function ProductLaunchChecklistClient() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <section className="grid gap-4">
      {checks.map((check) => {
        const checked = Boolean(done[check]);
        return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Launch Checklist",
        subtitle: "Premium VYRON COST workflow for product launch checklist.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <button key={check} onClick={() => setDone((current) => ({ ...current, [check]: !checked }))} className="flex items-center gap-4 rounded-[2rem] bg-white p-5 text-left shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${checked ? "bg-[#A855F7]/100 text-white" : "bg-slate-100 text-slate-400"}`}>
                    <CheckCircle2 size={24} />
                  </span>
                  <span className="text-lg font-black text-[#F8FAFC]">{check}</span>
                </button>
    </VyronPremiumPageShell>
  );
      })}
    </section>
  );
}
