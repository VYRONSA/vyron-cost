"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { ProcurementRiskFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrderIntelligenceClient({ risks }: { risks: ProcurementRiskFinding[] }) {
  const exposure = risks.reduce((sum, row) => sum + Number(row.spend_amount || 0), 0);
  const high = risks.filter((row) => Number(row.risk_score || 0) >= 75).length;

  return (
    <VyronPremiumPageShell
      config={{
        title: "Purchase Order Intelligence",
        subtitle: "Premium VYRON COST workflow for purchase order intelligence.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <ShieldAlert className="text-red-700" size={30} />
                <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Procurement Exposure</div>
                <div className="mt-2 text-4xl font-black text-red-700">{money(exposure)}</div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">High Risk Items</div>
                <div className="mt-2 text-4xl font-black text-amber-600">{high}</div>
              </div>
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">Control Rule</div>
                <div className="mt-2 text-2xl font-black">PO before invoice</div>
                <p className="mt-2 text-sm text-slate-300">Every supplier invoice should match an approved PO.</p>
              </div>
            </section>

            <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                <div>Supplier</div>
                <div>Category</div>
                <div>Risk</div>
                <div>Score</div>
                <div>Movement</div>
                <div>Spend</div>
                <div>Action</div>
              </div>
              {risks.map((row) => (
                <div key={row.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <Link href="/purchase-orders" className="font-black text-[#65A30D]">{row.supplier_name}</Link>
                  <div>{row.category_name}</div>
                  <div>{row.risk_type}</div>
                  <div className="font-black text-red-700">{Number(row.risk_score || 0).toFixed(0)}</div>
                  <div>{Number(row.price_change_percent || 0).toFixed(1)}%</div>
                  <div className="font-black">{money(row.spend_amount)}</div>
                  <div className="text-xs font-bold text-slate-600">{row.action_required}</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
