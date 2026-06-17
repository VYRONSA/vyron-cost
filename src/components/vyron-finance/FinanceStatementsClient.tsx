"use client";

import { useState } from "react";
import type { VyronFinanceIntelligencePayload } from "@/lib/vyron-finance-intelligence-layer";
import { StatementTable } from "./VyronFinanceShared";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type PeriodKey = "monthly" | "quarterly" | "annual";

export default function FinanceStatementsClient({ statements }: { statements: VyronFinanceIntelligencePayload["statements"] }) {
  const [period, setPeriod] = useState<PeriodKey>("monthly");
  const set = statements[period];

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Finance Statements",
        subtitle: "Premium VYRON COST workflow for finance statements.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["monthly", "Monthly"],
                  ["quarterly", "Quarterly"],
                  ["annual", "Annual"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`rounded-xl px-4 py-2 text-xs font-black ${period === key ? "bg-violet-600 text-white" : "bg-white text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-sm font-bold text-slate-600">
              {set.periodLabel} · Prior period comparative {set.comparatives.priorPeriod.toLocaleString("en-ZA")}
            </p>
            <StatementTable lines={set.incomeStatement} title="Income Statement" />
            <div className="grid gap-6 lg:grid-cols-2">
              <StatementTable lines={set.balanceSheet} title="Balance Sheet" />
              <StatementTable lines={set.cashFlow} title="Cash Flow Statement" />
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
