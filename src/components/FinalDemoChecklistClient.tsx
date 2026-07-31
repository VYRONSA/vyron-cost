"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const checks = [
  ["/dashboard", "Dashboard opens"],
  ["/executive-dashboard", "Executive dashboard shows recovery"],
  ["/product-profitability", "Product profitability explains GP gap"],
  ["/recipe-cost-drilldown", "Recipe cost drilldown explains cost"],
  ["/supplier-intelligence", "Supplier intelligence opens"],
  ["/financial-leakage", "Financial leakage shows recovery"],
  ["/invoice-processing", "Invoice processing opens"],
  ["/commercial-launch", "Commercial launch opens"],
  ["/client-proposal-studio", "Proposal export works"],
];

export default function FinalDemoChecklistClient() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <section className="grid gap-4">
      {checks.map(([href, label], index) => {
        const checked = Boolean(done[href]);
        return (
    <VyronPremiumPageShell
      config={{
        title: "Final Demo Checklist",
        subtitle: "Premium VYRON COST workflow for final demo checklist.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={href} className="grid gap-4 rounded-[2rem] bg-white p-5 md:grid-cols-[60px_1fr_180px] md:items-center">
                  <button onClick={() => setDone((current) => ({ ...current, [href]: !checked }))} className={`flex h-12 w-12 items-center justify-center rounded-2xl ${checked ? "bg-[#A855F7]/100 text-white" : "bg-slate-100 text-slate-400"}`}>
                    <CheckCircle2 size={24} />
                  </button>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Final test {index + 1}</div>
                    <div className="font-black text-[#F8FAFC]">{label}</div>
                  </div>
                  <Link href={href} className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-3 text-center text-sm font-black text-[#4D7C0F]">Open</Link>
                </div>
    </VyronPremiumPageShell>
  );
      })}
    </section>
  );
}
