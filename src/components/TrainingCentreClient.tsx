"use client";

import { BookOpen, Download, PlayCircle } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const sections = [
  ["1. Add suppliers", "Capture supplier name, category, contact email, invoice email and payment terms."],
  ["2. Add ingredients", "Capture purchase unit, recipe unit, current cost, previous cost and yield."],
  ["3. Build BOMs", "Add ingredients, packaging, labour, overhead and wastage. Set yield and target GP."],
  ["4. Link products", "Create finished products and link them to BOMs for automatic GP calculation."],
  ["5. Review recovery", "Open financial leakage and explain formula, monthly recovery and annual recovery."],
  ["6. Use AI", "Ask VYRON which products are below GP, which suppliers increased prices and what to do today."],
];

function downloadManual() {
  const text = [
    "VYRON COST — Handcrafted Foods Demo Manual",
    "",
    ...sections.flatMap(([title, detail]) => [title, detail, ""]),
  ].join("\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vyron-cost-handcrafted-foods-training-manual.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export default function TrainingCentreClient() {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Training Centre",
        subtitle: "Premium VYRON COST workflow for training centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <BookOpen size={34} className="text-[#A855F7]" />
              <h2 className="mt-5 text-3xl font-black">Training Centre</h2>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                Client-facing training for every step from setup to costing, recovery and reporting.
              </p>
              <button
                type="button"
                onClick={downloadManual}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-3 text-sm font-black text-[#F8FAFC]"
              >
                <Download size={17} />
                Download manual
              </button>
            </div>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {sections.map(([title, detail]) => (
                <div key={title} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <PlayCircle size={28} className="text-[#7E22CE]" />
                  <h3 className="mt-5 text-xl font-black text-[#F8FAFC]">{title}</h3>
                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{detail}</p>
                </div>
              ))}
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
