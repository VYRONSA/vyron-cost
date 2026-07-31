"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Factory, AlertTriangle, TrendingDown, Package } from "lucide-react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  VyronPremiumFormulaCard,
  VyronPremiumInsightCard,
  VyronPremiumInsightsPanel,
  VyronPremiumMetricCard,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";
import { VYRON_DOMAIN_QUOTES } from "@/components/vyron-premium/VyronPremiumTheme";

type Stats = {
  productionThisWeek: number;
  productionThisMonth: number;
  productionCost: number;
  yieldPct: number;
  wastagePct: number;
  ingredientUsageValue: number;
  packagingUsageValue: number;
  finishedGoodsProduced: number;
  productionVariances: number;
  productionEfficiency: number;
  finishedGoodsValue: number;
  activeRuns: number;
};

type Insight = { severity: string; category: string; message: string; href?: string };

export default function ManufacturingDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/production/stats${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
    fetch(`/api/production/insights${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setInsights(d.insights);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cards = [
    ["Production This Week", stats ? String(stats.productionThisWeek) : "…", "/manufacturing/history"],
    ["Production This Month", stats ? String(stats.productionThisMonth) : "…", "/manufacturing/history"],
    ["Production Cost", stats ? formatMoney(stats.productionCost) : "…", "/manufacturing/variances"],
    ["Yield %", stats ? `${stats.yieldPct}%` : "…", "/manufacturing/variances"],
    ["Wastage %", stats ? `${stats.wastagePct}%` : "…", "/manufacturing/variances"],
    ["Ingredient Usage", stats ? formatMoney(stats.ingredientUsageValue) : "…", "/inventory/stock?entityType=ingredient"],
    ["Packaging Usage", stats ? formatMoney(stats.packagingUsageValue) : "…", "/inventory/stock?entityType=packaging"],
    ["Finished Goods Produced", stats ? String(stats.finishedGoodsProduced) : "…", "/manufacturing/finished-goods"],
    ["Production Variances", stats ? String(stats.productionVariances) : "…", "/manufacturing/variances"],
    ["Production Efficiency", stats ? `${stats.productionEfficiency}%` : "…", "/manufacturing/variances"],
  ];

  const manufacturingActions = (
    <>
      <Link href="/manufacturing/runs/new" className="rounded-xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-semibold text-[#F8FAFC]">
        New Production Run
      </Link>
      <Link href="/manufacturing/history" className="rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-5 py-3 text-sm font-semibold text-[#334155]">
        Manufacturing History
      </Link>
      <Link href="/manufacturing/finished-goods" className="rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-3 text-sm font-semibold text-[var(--vyron-warning-fg)]">
        Finished Goods
      </Link>
      <Link href="/recipes" className="rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-5 py-3 text-sm font-semibold text-[#334155]">
        Recipes & BOM
      </Link>
    </>
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "manufacturing",
        badge: "Premium Production Workspace",
        title: "Manufacturing Control",
        subtitle: "Production output, batch cost, yield, wastage and finished goods from live runs — every batch is a financial event.",
        outcomes: [
          "Monitor weekly and monthly production output",
          "Track yield, wastage and batch cost",
          "See finished goods inventory value",
          "Act on AI production insights",
        ],
        quotes: VYRON_DOMAIN_QUOTES.manufacturing,
        controlTitle: "Manufacturing Control",
        formulaEyebrow: "Yield & wastage",
        formulaTitle: "How production performance is measured",
        formulas: [
          { label: "Yield %", formula: "Actual output ÷ Planned output × 100" },
          { label: "Wastage %", formula: "Waste quantity ÷ Input quantity × 100" },
          { label: "Efficiency", formula: "Standard cost ÷ Actual cost × 100" },
        ],
      }}
      actions={manufacturingActions}
    >
      <VyronPremiumSectionHeading eyebrow="Live metrics" title="Production snapshot" subtitle="Tap any card to drill into history, variances or stock." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(([label, value, href]) => (
          <VyronPremiumMetricCard key={label} label={label} value={value} href={href} icon={<Factory size={22} />} />
        ))}
      </div>

      <VyronPremiumFormulaCard
        variant="dark"
        eyebrow="Batch economics"
        title="Cost roll-up from the line"
        formulas={[
          { label: "Production Cost", formula: "Ingredient usage + packaging + labour + overhead" },
          { label: "Variance", formula: "Actual batch cost − Standard BOM cost" },
          { label: "FG Value", formula: "Finished units × weighted average unit cost" },
        ]}
      />

      {stats ? (
        <div className="relative overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.09)] bg-white/80 p-6 text-[#0F172A] shadow-[0_4px_28px_rgba(0,0,0,0.2)]">
          <div className="relative flex flex-wrap items-center gap-6">
            <Package className="text-[#A855F7]" size={32} />
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">Finished Goods Inventory Value</div>
              <div className="mt-1 text-3xl font-black">{formatMoney(stats.finishedGoodsValue)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Active runs</div>
              <div className="mt-1 text-3xl font-black text-[var(--vyron-warning-fg)]">{stats.activeRuns}</div>
            </div>
          </div>
        </div>
      ) : null}

      {insights.length > 0 ? (
        <VyronPremiumInsightsPanel title="AI Production Insights" icon={<AlertTriangle size={18} />}>
          {insights.map((item, i) => (
            <VyronPremiumInsightCard key={i} category={item.category} message={item.message} href={item.href} />
          ))}
        </VyronPremiumInsightsPanel>
      ) : (
        <div className="rounded-2xl border border-[rgba(15,23,42,0.09)] bg-white/80 p-6 text-sm font-medium text-[#94A3B8]">
          <TrendingDown className="mb-3 text-violet-300" size={28} />
          <VyronPremiumSectionHeading title="Insights will appear here" subtitle="Complete production runs to generate yield, wastage and cost insights." />
        </div>
      )}
    </VyronPremiumPageShell>
  );
}
