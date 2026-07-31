"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const routes = [
  ["/dashboard", "Dashboard"],
  ["/executive-dashboard", "Executive Dashboard"],
  ["/product-profitability", "Product Profitability"],
  ["/financial-leakage", "Financial Leakage"],
  ["/supplier-intelligence", "Supplier Intelligence"],
  ["/invoice-processing", "Invoice Processing"],
  ["/training", "Training Manual"],
  ["/client-proposal-studio", "Proposal Studio"],
];

export default function GoLiveCommandCentreClient() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const complete = routes.filter(([href]) => done[href]).length;
  const score = Math.round((complete / routes.length) * 100);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Go-Live Score</div>
        <div className="mt-3 text-6xl font-black">{score}%</div>
      </div>
      <div className="grid gap-4">
        {routes.map(([href, label]) => {
          const checked = Boolean(done[href]);
          return (
    <VyronPremiumPageShell
      config={{
        title: "Go Live Command Centre",
        subtitle: "Premium VYRON COST workflow for go live command centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={href} className="grid gap-4 rounded-[2rem] bg-white p-5 md:grid-cols-[60px_1fr_160px] md:items-center">
                    <button onClick={() => setDone((current) => ({ ...current, [href]: !checked }))} className={`flex h-12 w-12 items-center justify-center rounded-2xl ${checked ? "bg-[#A855F7]/100 text-white" : "bg-slate-100 text-slate-400"}`}>
                      <CheckCircle2 size={24} />
                    </button>
                    <div>
                      <div className="font-black text-[#F8FAFC]">{label}</div>
                      <div className="text-xs font-bold text-slate-500">{href}</div>
                    </div>
                    <Link href={href} className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-3 text-center text-sm font-black text-[#4D7C0F]">Open</Link>
                  </div>
    </VyronPremiumPageShell>
  );
        })}
      </div>
    </section>
  );
}
