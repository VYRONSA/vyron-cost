"use client";

import Link from "next/link";
import { Bot, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const actions = [
  ["Create Chicken Pie BOM", "/recipes/new", "Open BOM Builder with pie costing flow."],
  ["Review products below GP", "/product-profitability", "Rank products by GP gap and recovery risk."],
  ["Explain recovery", "/financial-leakage", "Open leakage detail and formula view."],
  ["Find supplier increases", "/supplier-intelligence", "Show supplier movement and negotiation values."],
  ["Process invoices", "/invoice-processing", "Review invoice queue and confidence."],
  ["Plan production", "/production-planning", "Convert forecast demand into batches."],
];

export default function AiOperatorActionsClient() {
  const [executed, setExecuted] = useState<Record<string, boolean>>({});

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <Bot size={34} className="text-[#A855F7]" />
        <h2 className="mt-5 text-3xl font-black">AI Operator Actions</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
          These are the action routes VYRON AI can guide or execute next. This turns the assistant from answer-only into operator-ready.
        </p>
      </div>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {actions.map(([title, href, detail]) => {
          const done = Boolean(executed[title]);
          return (
    <VyronPremiumPageShell
      config={{
        title: "Ai Operator Actions",
        subtitle: "Premium VYRON COST workflow for ai operator actions.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={title} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                    <button
                      type="button"
                      onClick={() => setExecuted((current) => ({ ...current, [title]: !done }))}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${done ? "bg-[#A855F7]/100 text-white" : "bg-slate-100 text-slate-400"}`}
                    >
                      <CheckCircle2 size={24} />
                    </button>
                    <h3 className="mt-5 text-xl font-black text-[#F8FAFC]">{title}</h3>
                    <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{detail}</p>
                    <Link href={href} className="mt-5 inline-flex rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-3 text-sm font-black text-[#4D7C0F]">
                      Open action
                    </Link>
                  </div>
    </VyronPremiumPageShell>
  );
        })}
      </section>
    </section>
  );
}
