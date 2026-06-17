"use client";

import { formatSupplierSpend, type SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ContractPriceReviewClient({ suppliers }: { suppliers: SupplierIntelRow[] }) {
  const rows = suppliers.slice(0, 12).map((supplier) => ({
    ...supplier,
    contractVariance: Number(supplier.current_spend || 0) * (Number(supplier.price_movement_percent || 0) / 100) * 0.25,
    renewalRisk: Number(supplier.supplier_risk_score || 0) >= 75 ? "High" : "Review",
  }));

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Contract Intelligence",
        title: "Contract Price Review Centre",
        subtitle: "Review supplier movement and contract variance to guide pricing and renewal actions.",
        outcomes: ["Highlight renewal risk exposure", "Quantify contract variance impact", "Direct supplier contract review actions"],
        formulas: ["Contract Variance = Current Spend x Movement % x 0.25", "Renewal Risk escalates with supplier risk score", "Movement % sourced from supplier price trend"],
        intelligenceItems: [
          { label: "Review rows", detail: `${rows.length} suppliers in contract review set` },
          { label: "Input suppliers", detail: `${suppliers.length} source supplier records` },
          { label: "Action mode", detail: "Table optimized for renewal and pricing review" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-[#A3E635]">
          <div className="col-span-2">Supplier</div>
          <div>Category</div>
          <div>Movement</div>
          <div>Contract Variance</div>
          <div>Renewal Risk</div>
          <div>Action</div>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-5 text-sm">
            <div className="col-span-2 font-black text-[#F8FAFC]">{row.supplier_name}</div>
            <div>{row.category}</div>
            <div className="font-black text-red-700">{row.price_movement_percent.toFixed(1)}%</div>
            <div className="font-black text-[#65A30D]">{formatSupplierSpend(row.contractVariance)}</div>
            <div>{row.renewalRisk}</div>
            <div className="text-xs font-bold text-slate-600">Review contract</div>
          </div>
        ))}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
