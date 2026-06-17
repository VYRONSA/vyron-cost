"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumMetricCard,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

type Stats = {
  rawMaterialValue: number;
  finishedGoodsValue: number;
  totalInventoryValue: number;
  inventoryTurns: number;
  stockTurnover: number;
  lowStockItems: number;
  negativeStockRisks: number;
};

export default function InventoryIntelligenceDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/stats${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cards: Array<{
    label: string;
    value: string;
    href: string;
    note?: string;
    tone: "default" | "warning" | "danger";
  }> = [
    { label: "Raw Material Value", value: stats ? formatMoney(stats.rawMaterialValue) : "…", href: "/inventory/stock?entityType=ingredient", tone: "default" },
    { label: "Finished Goods Value", value: stats ? formatMoney(stats.finishedGoodsValue) : "…", href: "/inventory-intelligence/finished-goods", tone: "default" },
    { label: "Total Inventory Value", value: stats ? formatMoney(stats.totalInventoryValue) : "…", href: "/inventory", tone: "default" },
    {
      label: "Inventory Turns",
      value: stats ? `${stats.inventoryTurns ?? stats.stockTurnover}x` : "…",
      href: "/inventory/ledger",
      note: "90-day COGS / inventory value",
      tone: "default",
    },
    {
      label: "Low Stock Items",
      value: stats ? String(stats.lowStockItems) : "…",
      href: "/inventory/alerts",
      tone: stats && stats.lowStockItems > 0 ? "warning" : "default",
    },
    {
      label: "Negative Stock Risks",
      value: stats ? String(stats.negativeStockRisks) : "…",
      href: "/inventory/stock?status=Out%20Of%20Stock",
      tone: stats && stats.negativeStockRisks > 0 ? "danger" : "default",
    },
  ];

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Intelligence Workspace"
        title="Inventory Intelligence"
        subtitle="Raw materials, finished goods, inventory turns, low stock and negative stock risk across the full procurement-to-sales workflow."
        quotes={[
          {
            label: "Working capital",
            quote: "Turns reveal how fast cash trapped in stock converts back into margin.",
          },
          {
            label: "Risk signal",
            quote: "Low stock and negative ledger risks are early warnings — not afterthoughts.",
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          eyebrow="Turns"
          title="Inventory velocity"
          formulas={[
            { label: "Inventory Turns", formula: "COGS (90 days) ÷ Average inventory value" },
            { label: "Days on Hand", formula: "365 ÷ Inventory turns" },
          ]}
        />
        <VyronPremiumFormulaCard
          variant="light"
          eyebrow="Exposure"
          title="Value at risk"
          formulas={[
            { label: "Raw Material Value", formula: "Σ ingredient & packaging on-hand × avg cost" },
            { label: "Finished Goods Value", formula: "Σ FG on-hand × weighted average cost" },
            { label: "Total Inventory", formula: "Raw materials + finished goods + WIP" },
          ]}
        />
      </div>

      <VyronPremiumSectionHeading
        eyebrow="Executive view"
        title="Key inventory indicators"
        subtitle="Drill into stock, ledger or alerts from any metric."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <VyronPremiumMetricCard key={card.label} label={card.label} value={card.value} href={card.href} note={card.note} tone={card.tone} />
        ))}
      </div>
    </section>
  );
}
