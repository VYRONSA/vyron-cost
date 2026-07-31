"use client";

import { Download } from "lucide-react";
import { LaunchReadinessSnapshot, formatLaunchMoney } from "@/lib/vyron-launch-readiness-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ClientProposalStudioClient({ snapshot }: { snapshot: LaunchReadinessSnapshot }) {
  function downloadProposal() {
    const text = [
      "VYRON COST — Handcrafted Foods Proposal",
      "",
      `Potential monthly recovery: ${formatLaunchMoney(snapshot.realisticMonthlyRecovery)}`,
      `Potential annual recovery: ${formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12)}`,
      `Products under GP: ${snapshot.productsUnderGp}`,
      `High risk suppliers: ${snapshot.highRiskSuppliers}`,
      "",
      "Recommended next step:",
      "Start a paid pilot using Handcrafted Foods product, BOM, supplier and invoice data.",
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-handcrafted-foods-proposal.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Client Proposal Studio",
        subtitle: "Premium VYRON COST workflow for client proposal studio.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-3xl font-black text-[#F8FAFC]">Client Proposal</h2>
              <div className="mt-5 space-y-4 text-sm font-semibold leading-7 text-slate-600">
                <p>VYRON COST will help Handcrafted Foods identify product margin leakage, supplier price movement, invoice risk and recoverable profit.</p>
                <p>Current demo analysis shows a realistic monthly recovery opportunity of <b>{formatLaunchMoney(snapshot.realisticMonthlyRecovery)}</b>.</p>
                <p>Annualised, this equals <b>{formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12)}</b> in potential recoverable value.</p>
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <h2 className="text-2xl font-black">Proposal Export</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                Download a simple proposal summary you can send after the demo.
              </p>
              <button
                type="button"
                onClick={downloadProposal}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-black text-[#F8FAFC]"
              >
                <Download size={17} />
                Download proposal
              </button>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
