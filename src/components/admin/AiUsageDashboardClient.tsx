"use client";

import { useEffect, useState } from "react";
import type { AiAllowanceStatus, AiUsageSummary } from "@/lib/platform/ai";

const STATUS_STYLE: Record<AiAllowanceStatus, { color: string; label: string }> = {
  ok: { color: "#0ca30c", label: "Within allowance" },
  warning_80: { color: "#fab219", label: "80% of monthly allowance used" },
  warning_95: { color: "#ec835a", label: "95% of monthly allowance used — upgrade recommended" },
  exceeded: { color: "#d03b3b", label: "Monthly AI allowance reached" },
};

const FEATURE_LABEL: Record<string, string> = {
  document_intelligence: "Document Intelligence",
  ask_vyron: "Ask VYRON",
  cost_intelligence: "Cost Intelligence",
  supplier_intelligence: "Supplier Intelligence",
  manufacturing_intelligence: "Manufacturing Intelligence",
  executive_decision_centre: "Executive Decision Centre",
  forecasting: "Forecasting",
};

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-[#898781]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[#0b0b0b] dark:text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-[#52514e] dark:text-[#c3c2b7]">{sub}</div> : null}
    </div>
  );
}

function SequentialBar({ label, value, max, sublabel }: { label: string; value: number; max: number; sublabel: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3" title={`${label}: ${sublabel}`}>
      <div className="w-24 shrink-0 text-xs text-[#52514e] dark:text-[#c3c2b7]">{label}</div>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e1e0d9] dark:bg-[#2c2c2a]">
        <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-xs tabular-nums text-[#52514e] dark:text-[#c3c2b7]">{sublabel}</div>
    </div>
  );
}

export default function AiUsageDashboardClient() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspace/admin/ai-usage")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setSummary(data.summary as AiUsageSummary);
        else setError(data.error || "Failed to load AI usage summary.");
      })
      .catch(() => setError("Failed to load AI usage summary."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-[#52514e] dark:text-[#c3c2b7]">Loading AI usage…</div>;
  }

  if (error || !summary) {
    return <div className="p-6 text-sm text-[#d03b3b]">{error || "No AI usage data available."}</div>;
  }

  const { allowance } = summary;
  const status = STATUS_STYLE[allowance.status];
  const maxDaily = Math.max(1, ...summary.dailyUsage.map((point) => point.requests));
  const maxMonthly = Math.max(1, allowance.creditsLimit, allowance.creditsUsed);

  return (
    <div className="space-y-6 p-1">
      <div
        className="flex items-start gap-3 rounded-lg border p-4"
        style={{ borderColor: `${status.color}55`, backgroundColor: `${status.color}14` }}
      >
        <span aria-hidden className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
        <div>
          <div className="text-sm font-semibold text-[#0b0b0b] dark:text-white">
            {status.label} · Tier: {allowance.packageId.replace(/_/g, " ")}
          </div>
          {allowance.status === "exceeded" ? (
            <p className="mt-1 text-sm text-[#52514e] dark:text-[#c3c2b7]">
              You have reached your monthly AI allowance. Upgrade your subscription to continue using AI features.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Credits used" value={`${allowance.creditsUsed} / ${allowance.creditsLimit}`} sub={`${allowance.percentOfLimitUsed}% of allowance`} />
        <StatTile
          label="Estimated monthly cost"
          value={`$${summary.estimatedMonthlyCostUsd.toFixed(2)}`}
          sub={`${summary.companyCurrency} ${summary.estimatedMonthlyCostCompanyCurrency.toFixed(2)}`}
        />
        <StatTile label="Requests this month" value={`${allowance.requestsUsed} / ${allowance.requestsLimit}`} />
        <StatTile label="Projected month-end" value={`${summary.projectedMonthEndCredits} credits`} sub="Linear run-rate projection" />
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-3 text-sm font-semibold text-[#0b0b0b] dark:text-white">Daily usage (this month)</div>
        {summary.dailyUsage.length === 0 ? (
          <div className="text-sm text-[#898781]">No AI requests recorded yet this month.</div>
        ) : (
          <div className="space-y-2">
            {summary.dailyUsage.map((point) => (
              <SequentialBar
                key={point.date}
                label={point.date.slice(5)}
                value={point.requests}
                max={maxDaily}
                sublabel={`${point.requests} req · $${point.costUsd.toFixed(2)}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-3 text-sm font-semibold text-[#0b0b0b] dark:text-white">Top features</div>
          {summary.topFeatures.length === 0 ? (
            <div className="text-sm text-[#898781]">No usage recorded yet this month.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#898781]">
                  <th className="pb-2 font-medium">Feature</th>
                  <th className="pb-2 text-right font-medium">Requests</th>
                  <th className="pb-2 text-right font-medium">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {summary.topFeatures.map((row) => (
                  <tr key={row.featureId} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1.5 text-[#0b0b0b] dark:text-white">{FEATURE_LABEL[row.featureId] || row.featureId}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#52514e] dark:text-[#c3c2b7]">{row.requests}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#52514e] dark:text-[#c3c2b7]">${row.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-3 text-sm font-semibold text-[#0b0b0b] dark:text-white">Top users</div>
          {summary.topUsers.length === 0 ? (
            <div className="text-sm text-[#898781]">No attributable usage recorded yet this month.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#898781]">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 text-right font-medium">Requests</th>
                  <th className="pb-2 text-right font-medium">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {summary.topUsers.map((row) => (
                  <tr key={row.userId} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1.5 text-[#0b0b0b] dark:text-white">{row.userId}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#52514e] dark:text-[#c3c2b7]">{row.requests}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#52514e] dark:text-[#c3c2b7]">${row.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <SequentialBar label="Credits" value={allowance.creditsUsed} max={maxMonthly} sublabel={`${allowance.creditsUsed} / ${allowance.creditsLimit}`} />
      </div>
    </div>
  );
}
