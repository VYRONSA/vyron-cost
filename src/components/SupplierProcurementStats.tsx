"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

export default function SupplierProcurementStats({ supplierId }: { supplierId: string }) {
  const [stats, setStats] = useState<{
    poCount: number;
    grnCount: number;
    invoiceCount: number;
    spendThisMonth: number;
    spendThisYear: number;
    averageVariancePercent: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/suppliers/${supplierId}/procurement`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
  }, [supplierId]);

  if (!stats) return null;

  return (
    <section className="mt-5 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      {[
        ["PO Count", stats.poCount],
        ["GRN Count", stats.grnCount],
        ["Invoices", stats.invoiceCount],
        ["Spend (month)", formatMoney(stats.spendThisMonth)],
        ["Spend (year)", formatMoney(stats.spendThisYear)],
        ["Avg variance %", `${stats.averageVariancePercent}%`],
      ].map(([label, value]) => (
        <div key={String(label)} className="rounded-2xl bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">{label}</div>
          <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
        </div>
      ))}
    </section>
  );
}
