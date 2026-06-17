"use client";

import { Download } from "lucide-react";
import { formatSupplierSpend, type SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function SupplierNegotiationPackClient({ suppliers }: { suppliers: SupplierIntelRow[] }) {
  const priority = suppliers
    .filter((supplier) => Number(supplier.negotiation_opportunity || 0) > 0)
    .sort((a, b) => Number(b.negotiation_opportunity || 0) - Number(a.negotiation_opportunity || 0))
    .slice(0, 10);

  function downloadPack() {
    const body = priority
      .map((s) => `${s.supplier_name}: opportunity ${formatSupplierSpend(s.negotiation_opportunity)}, movement ${s.price_movement_percent.toFixed(1)}%, action ${s.recommended_action}`)
      .join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vyron-cost-supplier-negotiation-pack.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Negotiation Pack",
        subtitle: "Premium VYRON COST workflow for supplier negotiation pack.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <h2 className="text-3xl font-black">Supplier Negotiation Pack</h2>
              <p className="mt-3 text-sm font-semibold text-slate-300">Use this with suppliers to negotiate price movement and recover margin.</p>
              <button onClick={downloadPack} className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-3 text-sm font-black text-[#F8FAFC]">
                <Download size={17} /> Download pack
              </button>
            </div>

            <div className="grid gap-4">
              {priority.map((supplier) => (
                <div key={supplier.id} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-2xl font-black text-[#F8FAFC]">{supplier.supplier_name}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{supplier.category} · movement {supplier.price_movement_percent.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-[#65A30D]">{formatSupplierSpend(supplier.negotiation_opportunity)}</div>
                      <div className="text-xs font-bold text-slate-400">negotiation opportunity</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">{supplier.recommended_action}</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
