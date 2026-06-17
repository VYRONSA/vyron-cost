"use client";

import { BrainCircuit, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  PROCUREMENT_RECOMMENDATION_CATEGORIES,
} from "@/lib/vyron-procurement-ai-engine";
import {
  procurementMoney,
  type ProcurementExecutiveStats,
  type ProcurementRecommendation,
} from "@/lib/vyron-procurement-ai-data";

const STATUS_COLOURS: Record<string, string> = {
  New: "bg-slate-100 text-slate-700",
  Assigned: "bg-amber-100 text-amber-800",
  "Under Review": "bg-sky-100 text-sky-800",
  Accepted: "bg-[#A3E635]/12 text-[#4D7C0F]",
  Rejected: "bg-red-100 text-red-800",
  Implemented: "bg-indigo-100 text-indigo-800",
  Closed: "bg-slate-200 text-slate-600",
  "Scheduled Review": "bg-violet-100 text-violet-800",
};

export default function AiProcurementManagerClient({
  recommendations,
  stats,
}: {
  recommendations: ProcurementRecommendation[];
  stats: ProcurementExecutiveStats;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [recomputing, setRecomputing] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recommendations.filter((row) => {
      if (category !== "All" && row.category !== category) return false;
      if (!term) return true;
      return [row.title, row.category, row.summary, row.recommended_action, row.status]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [recommendations, search, category]);

  const health = stats.healthScore;

  async function recompute() {
    setRecomputing(true);
    await fetch("/api/procurement/recommendations", { method: "POST" });
    setRecomputing(false);
    router.refresh();
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "procurement",
        badge: "Procurement Intelligence",
        title: "AI Procurement Command Centre",
        subtitle: "Coordinate procurement recommendations, risk, and savings with an executive-ready control layer.",
        outcomes: ["Prioritize high-value procurement actions", "Track recommendation lifecycle clearly", "Quantify potential and realized savings"],
        formulas: ["Potential Savings = Open Action Annual Benefit", "Realized Savings = Implemented Benefit Annualized", "Health Score = Composite module signal index"],
        intelligenceItems: [
          { label: "Recommendation pool", detail: `${recommendations.length} total recommendations generated` },
          { label: "Filtered actions", detail: `${filtered.length} items in current search and category` },
          { label: "Savings split", detail: "Potential and realized outcomes visible together for decisions" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="rounded-[2rem] bg-gradient-to-r from-violet-700 to-indigo-800 p-6 text-white shadow-[0_18px_50px_rgba(81,63,190,0.2)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-200">
              <BrainCircuit size={16} /> See It. Understand It. Fix It.
            </div>
            <h2 className="mt-2 text-2xl font-black">AI Procurement Command Centre</h2>
            <p className="mt-2 max-w-xl text-sm font-semibold text-violet-100">
              Recommendations from supplier price history, POs, GRNs, invoices, inventory, production, and recovery intelligence — not generic AI text.
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-black">{health.overall}</div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-200">/ 100</div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            { label: "Supplier risk", value: health.supplierRisk },
            { label: "Price stability", value: health.priceStability },
            { label: "Inventory health", value: health.inventoryHealth },
            { label: "Recovery performance", value: health.recoveryPerformance },
            { label: "PO compliance", value: health.poCompliance },
            { label: "Invoice compliance", value: health.invoiceCompliance },
            { label: "Production efficiency", value: health.productionEfficiency },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/10 px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-200">{item.label}</div>
              <div className="mt-1 text-xl font-black">{item.value}</div>
            </div>
          ))}
        </div>
        {health.notes.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs font-semibold text-violet-100">
            {health.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={recomputing}
          onClick={() => void recompute()}
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
        >
          <RefreshCw size={16} className={recomputing ? "animate-spin" : ""} />
          {recomputing ? "Regenerating…" : "Regenerate from live data"}
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Open Recommendations</div>
          <div className="mt-3 text-4xl font-black text-amber-600">{stats.openRecommendations}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Accepted</div>
          <div className="mt-3 text-4xl font-black text-sky-700">{stats.acceptedRecommendations}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Implemented</div>
          <div className="mt-3 text-4xl font-black text-[#65A30D]">{stats.implementedRecommendations}</div>
        </div>
        <div className="rounded-[2rem] bg-red-50 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-red-600">High risk items</div>
          <div className="mt-3 text-4xl font-black text-red-700">{stats.highRiskItems}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Potential Savings</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{procurementMoney(stats.potentialSavingsAnnual)}</div>
          <p className="mt-1 text-xs font-bold text-slate-500">Annualized open actions</p>
        </div>
        <div className="rounded-[2rem] bg-[#A3E635]/10 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#84CC16]">Realized Savings</div>
          <div className="mt-3 text-4xl font-black text-[#84CC16]">{procurementMoney(stats.realizedSavingsAnnual)}</div>
          <p className="mt-1 text-xs font-bold text-[#65A30D]">From implemented actions</p>
        </div>
      </div>

      <div className="rounded-[2rem] bg-slate-50 p-5 text-xs font-bold text-slate-600">
        Recommendations are computed from vyron_supplier_price_history, product intelligence, recovery tracking, and procurement risk alerts — not generic AI text. Where inputs are missing, assumptions are listed on each card.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recommendations…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-bold text-slate-800"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800"
        >
          <option value="All">All categories</option>
          {PROCUREMENT_RECOMMENDATION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

        <div className="grid gap-4">
        {filtered.map((row) => (
          <Link
            key={row.recommendation_key}
            href={`/ai-procurement-manager/${encodeURIComponent(row.recommendation_key)}`}
            className="block rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)] transition hover:shadow-[0_22px_60px_rgba(81,63,190,0.12)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">
                    {row.category}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${STATUS_COLOURS[row.status] || STATUS_COLOURS.New}`}
                  >
                    {row.status}
                  </span>
                  {row.is_estimated && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                      Assumption
                    </span>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-black text-slate-900">{row.title}</h3>
                <p className="mt-2 text-sm font-bold text-slate-600">{row.summary}</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Potential / year</div>
                <div className="mt-1 text-2xl font-black text-[#65A30D]">
                  {procurementMoney(row.potential_benefit_annual)}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">{row.confidence_level}</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#65A30D]">Recommendation</div>
              <p className="mt-1 text-sm font-bold text-[#4D7C0F]">{row.recommended_action}</p>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">{row.expected_result}</p>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-[2rem] bg-white p-8 text-center text-sm font-bold text-slate-500">
            No recommendations match your filters.
          </div>
        )}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
