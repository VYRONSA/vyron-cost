"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { procurementMoney, type ProcurementRecommendation } from "@/lib/vyron-procurement-ai-data";

export default function SupplierAiRecommendations({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName?: string;
}) {
  const [recs, setRecs] = useState<ProcurementRecommendation[]>([]);
  const [inflationNote, setInflationNote] = useState<string | null>(null);

  useEffect(() => {
    const params = supplierName ? `?name=${encodeURIComponent(supplierName)}` : "";
    fetch(`/api/suppliers/${supplierId}/recommendations${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRecs(d.recommendations);
      });
  }, [supplierId, supplierName]);

  useEffect(() => {
    const priceRec = recs.find((r) => r.category === "Price Increase");
    if (priceRec) {
      const pct = priceRec.data_used?.maxPercentageChange;
      setInflationNote(
        pct != null
          ? `Inflation risk: ${Number(pct).toFixed(1)}% movement detected on recent invoices.`
          : null
      );
    }
  }, [recs]);

  if (!recs.length && !inflationNote) return null;

  const savings = recs.reduce((s, r) => s + Number(r.potential_benefit_annual || 0), 0);

  return (
    <section className="mt-6 rounded-[2rem] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">AI Procurement Manager</div>
          <h3 className="mt-1 text-lg font-black text-slate-900">Recommendations & savings opportunities</h3>
        </div>
        <Link href="/ai-procurement-manager" className="text-sm font-black text-violet-700">
          Open command centre →
        </Link>
      </div>
      {inflationNote ? <p className="mt-3 text-sm font-bold text-amber-800">{inflationNote}</p> : null}
      {savings > 0 ? (
        <p className="mt-2 text-sm font-bold text-emerald-700">Potential savings: {procurementMoney(savings)}/year</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {recs.slice(0, 5).map((r) => (
          <li key={r.recommendation_key}>
            <Link
              href={`/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`}
              className="block rounded-xl bg-white p-4 shadow-sm transition hover:border-violet-200 border border-transparent"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-xs font-black uppercase text-violet-600">{r.category}</span>
                <span className="text-sm font-black text-emerald-700">{procurementMoney(r.potential_benefit_annual)}/yr</span>
              </div>
              <div className="mt-1 font-bold text-slate-900">{r.title}</div>
              <p className="mt-1 text-xs font-semibold text-slate-600">{r.recommended_action}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
