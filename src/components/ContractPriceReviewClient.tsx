"use client";

import { SupplierIntelRow, formatSupplierSpend } from "@/lib/vyron-supplier-intelligence-data";

export default function ContractPriceReviewClient({ suppliers }: { suppliers: SupplierIntelRow[] }) {
  const rows = suppliers.slice(0, 12).map((supplier) => ({
    ...supplier,
    contractVariance: Number(supplier.current_spend || 0) * (Number(supplier.price_movement_percent || 0) / 100) * 0.25,
    renewalRisk: Number(supplier.supplier_risk_score || 0) >= 75 ? "High" : "Review",
  }));

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-emerald-300">
          <div className="col-span-2">Supplier</div>
          <div>Category</div>
          <div>Movement</div>
          <div>Contract Variance</div>
          <div>Renewal Risk</div>
          <div>Action</div>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-7 border-t border-slate-100 px-5 py-5 text-sm">
            <div className="col-span-2 font-black text-[#07110d]">{row.supplier_name}</div>
            <div>{row.category}</div>
            <div className="font-black text-red-700">{row.price_movement_percent.toFixed(1)}%</div>
            <div className="font-black text-emerald-700">{formatSupplierSpend(row.contractVariance)}</div>
            <div>{row.renewalRisk}</div>
            <div className="text-xs font-bold text-slate-600">Review contract</div>
          </div>
        ))}
      </div>
    </section>
  );
}
