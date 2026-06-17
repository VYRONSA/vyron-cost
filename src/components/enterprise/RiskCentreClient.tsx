"use client";

import Link from "next/link";
import type { RiskItem } from "@/lib/vyron-enterprise-platform";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function riskBg(level: string) {
  if (level === "Critical") return "border-red-300 bg-red-50";
  if (level === "High") return "border-orange-300 bg-orange-50";
  if (level === "Medium") return "border-amber-300 bg-amber-50";
  return "border-[#A3E635]/30 bg-[#A3E635]/10";
}

export default function RiskCentreClient({ risks }: { risks: RiskItem[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Risk Centre",
        subtitle: "Premium VYRON COST workflow for risk centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {risks.map((r) => (
              <Link key={r.key} href={r.href} className={`rounded-[2rem] border p-6 transition hover:shadow-lg ${riskBg(r.level)}`}>
                <div className="text-xs font-black uppercase opacity-70">{r.label}</div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="text-4xl font-black">{r.score}</span>
                  <span className="text-sm font-black">{r.level}</span>
                </div>
                <p className="mt-3 text-sm font-semibold opacity-80">{r.detail}</p>
              </Link>
            ))}
          </section>
    </VyronPremiumPageShell>
  );
}
