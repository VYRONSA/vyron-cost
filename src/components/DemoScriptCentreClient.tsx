"use client";

import { Download } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const script = [
  "1. Start on Executive Dashboard and show monthly recovery.",
  "2. Open Product Profitability and show products below target GP.",
  "3. Open a product and explain BOM-linked cost.",
  "4. Open Supplier Intelligence and show supplier movement.",
  "5. Open Financial Leakage and explain the recovery formula.",
  "6. Open Invoice Processing and show PDF-to-line-item workflow.",
  "7. End with Commercial Launch Centre and proposal export.",
];

export default function DemoScriptCentreClient() {
  function downloadScript() {
    const blob = new Blob([script.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-demo-script.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Demo Script Centre",
        subtitle: "Premium VYRON COST workflow for demo script centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <h2 className="text-3xl font-black">Demo Script Centre</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">Use this exact order in client meetings.</p>
              <button onClick={downloadScript} className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-black text-[#F8FAFC]">
                <Download size={17} /> Download script
              </button>
            </div>

            <div className="grid gap-4">
              {script.map((line) => (
                <div key={line} className="rounded-[2rem] bg-white p-5 text-lg font-black text-[#F8FAFC] shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  {line}
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
