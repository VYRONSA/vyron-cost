"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

const checks = [
  ["/executive-dashboard", "Executive dashboard opens"],
  ["/product-profitability", "Product profitability opens"],
  ["/financial-leakage", "Financial leakage opens"],
  ["/supplier-intelligence", "Supplier intelligence opens"],
  ["/supplier-scorecards", "Supplier scorecards opens"],
  ["/forecasting", "Forecasting opens"],
  ["/forecast-simulator", "Forecast simulator opens"],
  ["/invoice-ai", "Invoice AI opens"],
  ["/invoice-processing", "Invoice processing opens"],
  ["/bulk-import-centre", "Bulk import centre opens"],
  ["/training-centre", "Training centre opens"],
  ["/client-onboarding", "Client onboarding opens"],
];

export default function DemoReadinessClient() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <section className="grid gap-4">
      {checks.map(([href, label], index) => {
        const checked = Boolean(done[href]);
        return (
          <div key={href} className="grid gap-4 rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:grid-cols-[60px_1fr_180px] md:items-center">
            <button
              type="button"
              onClick={() => setDone((current) => ({ ...current, [href]: !checked }))}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${checked ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}
            >
              <CheckCircle2 size={24} />
            </button>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Test {index + 1}</div>
              <div className="mt-1 text-lg font-black text-[#07110d]">{label}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{href}</div>
            </div>
            <Link href={href} className="rounded-2xl bg-emerald-50 px-5 py-3 text-center text-sm font-black text-emerald-800">
              Open
            </Link>
          </div>
        );
      })}
    </section>
  );
}
