"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const steps = [
  ["Company setup", "Confirm Handcrafted Foods demo company, VAT, branches and users.", "/executive-dashboard"],
  ["Suppliers", "Load Cape Flour Mills, Premium Meat Suppliers, Western Cape Poultry and Cape Packaging Solutions.", "/suppliers"],
  ["Ingredients", "Load pie ingredients, packaging, yield and supplier links.", "/ingredients"],
  ["BOMs", "Build Pepper Steak Pie, Chicken Pie and Steak & Kidney Pie BOMs.", "/recipes"],
  ["Products", "Link finished products to BOMs and confirm GP.", "/products"],
  ["Recovery", "Open leakage findings and explain recovery formulas.", "/financial-leakage"],
];

export default function ClientOnboardingWizardClient() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <h2 className="text-3xl font-black">Client Onboarding Wizard</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
          Use this checklist to onboard the first client without missing suppliers, ingredients, BOMs, products or recovery.
        </p>
      </div>

      <section className="grid gap-4">
        {steps.map(([title, detail, href], index) => {
          const checked = Boolean(done[title]);
          return (
    <VyronPremiumPageShell
      config={{
        title: "Client Onboarding Wizard",
        subtitle: "Premium VYRON COST workflow for client onboarding wizard.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={title} className="grid gap-4 rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:grid-cols-[70px_1fr_180px] md:items-center">
                    <button
                      type="button"
                      onClick={() => setDone((current) => ({ ...current, [title]: !checked }))}
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${checked ? "bg-[#A3E635]/100 text-white" : "bg-slate-100 text-slate-400"}`}
                    >
                      <CheckCircle2 size={26} />
                    </button>
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Step {index + 1}</div>
                      <h3 className="mt-1 text-xl font-black text-[#F8FAFC]">{title}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
                    </div>
                    <Link href={href} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-5 py-3 text-sm font-black text-[#4D7C0F]">
                      Open <ArrowRight size={16} />
                    </Link>
                  </div>
    </VyronPremiumPageShell>
  );
        })}
      </section>
    </section>
  );
}
