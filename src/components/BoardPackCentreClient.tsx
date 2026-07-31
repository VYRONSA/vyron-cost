"use client";

import { Download } from "lucide-react";
import { LaunchReadinessSnapshot, formatLaunchMoney } from "@/lib/vyron-launch-readiness-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function BoardPackCentreClient({ snapshot }: { snapshot: LaunchReadinessSnapshot }) {
  function downloadPack() {
    const text = [
      "VYRON COST BOARD PACK",
      "",
      `Readiness score: ${snapshot.readinessScore}%`,
      `Monthly recovery: ${formatLaunchMoney(snapshot.realisticMonthlyRecovery)}`,
      `Annual recovery: ${formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12)}`,
      `Products under GP: ${snapshot.productsUnderGp}`,
      `High risk suppliers: ${snapshot.highRiskSuppliers}`,
      `Forecast risk products: ${snapshot.forecastRiskProducts}`,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-board-pack.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Board Pack Centre",
        subtitle: "Premium VYRON COST workflow for board pack centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1fr_0.7fr]">
            <div className="rounded-[2rem] bg-white p-6">
              <h2 className="text-3xl font-black text-[#F8FAFC]">Board Pack Summary</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  ["Readiness", `${snapshot.readinessScore}%`],
                  ["Monthly Recovery", formatLaunchMoney(snapshot.realisticMonthlyRecovery)],
                  ["Annual Recovery", formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12)],
                  ["GP Risk Products", String(snapshot.productsUnderGp)],
                  ["Supplier Risks", String(snapshot.highRiskSuppliers)],
                  ["Forecast Risks", String(snapshot.forecastRiskProducts)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
                    <div className="mt-2 text-3xl font-black text-[#F8FAFC]">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <h2 className="text-2xl font-black">Download Board Pack</h2>
              <p className="mt-3 text-sm font-semibold text-slate-300">Export a client-facing summary for owner / director review.</p>
              <button onClick={downloadPack} className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-black text-[#F8FAFC]">
                <Download size={17} /> Download
              </button>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
