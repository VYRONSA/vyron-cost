"use client";

import { RefreshCcw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumEmptyState } from "@/components/vyron-premium/VyronPremiumSprint";
import {
  RecoveryOpportunity,
  money,
  type RecoveryExecutiveSummary,
  saveCalculatedOpportunities,
} from "@/lib/vyron-cost-recovery-data";

export default function RecoveryOpportunitiesClient({
  initialOpportunities,
  summary,
}: {
  initialOpportunities: RecoveryOpportunity[];
  summary: RecoveryExecutiveSummary;
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = verifiedOnly ? opportunities.filter((item) => !item.is_estimated) : opportunities;
    if (!term) return base;

    return base.filter((item) =>
      [
        item.title,
        item.opportunity_type,
        item.status || "",
        item.product_name || "",
        item.supplier_name || "",
        item.ingredient_name || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [opportunities, search, verifiedOnly]);

  async function saveGenerated() {
    setMessage("");
    setErrorMessage("");
    setSaving(true);

    try {
      const count = await saveCalculatedOpportunities();
      setMessage(`${count} calculated opportunities saved to the recovery register.`);
    } catch (error: any) {
      setErrorMessage(error?.message || "Could not save calculated opportunities.");
    } finally {
      setSaving(false);
    }
  }

  const funnelStatuses = ["New", "Under Review", "Accepted", "Actioned", "Recovered"] as const;
  const funnel = funnelStatuses.map((status) => ({
    status,
    count: opportunities.filter((item) => (item.tracking_status || item.status || "New") === status).length,
  }));

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        badge: "Recovery Intelligence",
        title: "Recovery Intelligence Centre",
        subtitle: "Track verified and estimated opportunities from identification through recovered value.",
        outcomes: ["Prioritize highest confidence recovery", "Track lifecycle from new to recovered", "Keep every value finance-explainable"],
        formulas: ["Annual Value = Monthly Value x 12", "Confidence Weight = Opportunity Value x Confidence %", "Recovered Gap = Potential Recovery - Actual Recovery"],
        intelligenceItems: [
          { label: "Pipeline visibility", detail: `${opportunities.length} total opportunities across funnel statuses` },
          { label: "Verified discipline", detail: "Estimated opportunities are clearly separated from verified value" },
          { label: "Execution flow", detail: "Actioned and recovered states keep accountability visible" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Estimated Recovery</div>
          <div className="mt-3 text-4xl font-black text-fuchsia-600">{money(summary.estimatedRecovery)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Verified Recovery</div>
          <div className="mt-3 text-4xl font-black text-[#7E22CE]">{money(summary.verifiedRecovery)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Potential Recovery</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{money(summary.potentialRecovery)}</div>
        </div>
        <div className="rounded-[2rem] bg-[#A855F7]/10 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#84CC16]">Recovered To Date</div>
          <div className="mt-3 text-4xl font-black text-[#84CC16]">{money(summary.recoveredToDate)}</div>
        </div>
      </div>

      <div className="rounded-[2rem] bg-slate-50 p-5 text-xs font-bold text-slate-600">
        Estimated Recovery uses assumptions where actual recipe quantity or sales volume is missing. These values are never presented as verified recoverable value.
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h3 className="text-lg font-black text-slate-900">Recovery Funnel</h3>
        <div className="mt-3 grid grid-cols-5 gap-3">
          {funnel.map((step) => (
            <div key={step.status} className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{step.status}</div>
              <div className="mt-2 text-2xl font-black text-violet-700">{step.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Recovery Opportunities</h2>
            <p className="text-sm font-semibold text-slate-500">
              Every recovery value must be explainable with formula, data source and recommended action.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex items-center rounded-2xl border border-slate-200 bg-white p-1 text-xs font-black">
              <button
                type="button"
                onClick={() => setVerifiedOnly(false)}
                className={`rounded-xl px-3 py-2 ${!verifiedOnly ? "bg-violet-700 text-white" : "text-slate-600"}`}
              >
                All Opportunities
              </button>
              <button
                type="button"
                onClick={() => setVerifiedOnly(true)}
                className={`rounded-xl px-3 py-2 ${verifiedOnly ? "vyron-grad-surface border border-transparent text-white" : "text-slate-600"}`}
              >
                Verified Only
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <Search size={18} className="text-violet-700" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search opportunities..."
                className="w-72 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={saveGenerated}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-60"
            >
              <RefreshCcw size={18} />
              {saving ? "Saving..." : "Save Calculated"}
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-bold text-[#7E22CE]">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {errorMessage}
          </div>
        )}
      </div>

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="grid grid-cols-10 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          <div>Opportunity</div>
          <div>Type</div>
          <div>Monthly</div>
          <div>Annual</div>
          <div>Confidence</div>
          <div>Confidence Level</div>
          <div>Recovery Type</div>
          <div>Status</div>
          <div>Source</div>
          <div>Open</div>
        </div>

        {filtered.map((item) => (
          <div key={item.id} className="grid grid-cols-10 items-center border-t border-slate-100 px-5 py-4 text-sm">
            <div>
              <div className="font-black text-slate-900">{item.title}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.is_estimated ? "bg-fuchsia-100 text-fuchsia-700" : "bg-[#A855F7]/12 text-[#7E22CE]"}`}>
                  {item.is_estimated ? "Estimated" : "Verified"}
                </span>
                {(item.missing_inputs?.length || 0) > 0 ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                    Low Data
                  </span>
                ) : null}
              </div>
            </div>
            <div className="font-bold text-slate-500">{item.opportunity_type}</div>
            <div className="font-black text-violet-700">{money(item.monthly_value)}</div>
            <div className="font-black text-[#84CC16]">{money(item.annual_value)}</div>
            <div className="font-black text-slate-900">{Number(item.confidence || 0).toFixed(0)}%</div>
            <div className={`font-black ${item.confidence_level === "High Confidence" ? "text-[#7E22CE]" : item.confidence_level === "Medium Confidence" ? "text-fuchsia-700" : "text-red-700"}`}>
              {item.confidence_level || "Medium Confidence"}
            </div>
            <div className={`text-xs font-black ${item.is_estimated ? "text-fuchsia-700" : "text-[#7E22CE]"}`}>
              {item.is_estimated ? "Estimated Recovery" : "Verified Recovery"}
            </div>
            <div className="font-black text-violet-700">{item.status || "Identified"}</div>
            <div className="font-bold text-slate-500">{item.data_source || "System"}</div>
            <div>
              <Link href={`/recovery-opportunities/${item.id}`} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
                Open
              </Link>
            </div>
          </div>
        ))}

          {filtered.length === 0 && (
            <div className="p-5">
              <VyronPremiumEmptyState
                title="Recovery Queue Empty"
                steps={[
                  "Clear search and status filters",
                  "Generate or import recovery opportunities",
                  "Save calculated opportunities to populate the register",
                ]}
              />
            </div>
          )}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
