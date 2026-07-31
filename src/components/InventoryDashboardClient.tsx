"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Boxes, ClipboardList, PackagePlus, RefreshCcw } from "lucide-react";
import { formatMoney } from "@/lib/vyron-cost-data";
import { useInventoryPermissions } from "@/hooks/useModulePermissions";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  VyronPremiumFormulaCard,
  VyronPremiumMetricCard,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";
import { VYRON_DOMAIN_QUOTES } from "@/components/vyron-premium/VyronPremiumTheme";

type Stats = {
  totalInventoryValue: number;
  ingredientsValue: number;
  packagingValue: number;
  rawMaterialValue: number;
  finishedGoodsValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  overstockItems: number;
  slowMovingItems: number;
  negativeStockRisks: number;
  inventoryVarianceValue: number;
  stockTurnover: number;
  inventoryTurns: number;
};

export default function InventoryDashboardClient() {
  const { canPostAdjustment } = useInventoryPermissions();
  const [stats, setStats] = useState<Stats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/stats${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      })
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function syncMasters() {
    if (!canPostAdjustment) {
      setMessage("You do not have permission to sync stock from masters.");
      return;
    }
    setSyncing(true);
    setMessage("");
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch("/api/inventory/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...workspaceBody, action: "sync" }),
    });
    const data = await res.json();
    setMessage(data.ok ? `Synced ${data.created} new stock item(s) from masters.` : data.error || "Sync failed");
    setSyncing(false);
    refresh();
  }

  const cards = [
    ["Total Inventory Value", stats ? formatMoney(stats.totalInventoryValue) : "R0,00", "/inventory/stock"],
    ["Raw Material Value", stats ? formatMoney(stats.rawMaterialValue ?? stats.ingredientsValue + stats.packagingValue) : "R0,00", "/inventory/stock?entityType=ingredient"],
    ["Finished Goods Value", stats ? formatMoney(stats.finishedGoodsValue) : "R0,00", "/inventory/stock?entityType=finished_goods"],
    ["Inventory Turns", stats ? `${stats.inventoryTurns ?? stats.stockTurnover}x` : "0x", "/inventory/ledger"],
    ["Low Stock", stats ? String(stats.lowStockItems) : "0", "/inventory/stock?status=Low%20Stock"],
    ["Negative Stock Risks", stats ? String(stats.negativeStockRisks) : "0", "/inventory/ledger"],
    ["Out Of Stock", stats ? String(stats.outOfStockItems) : "0", "/inventory/stock?status=Out%20Of%20Stock"],
    ["Overstock", stats ? String(stats.overstockItems) : "0", "/inventory/stock?status=Overstock"],
    ["Slow Moving", stats ? String(stats.slowMovingItems) : "0", "/inventory/stock?status=Slow%20Moving"],
    ["Variance Value", stats ? formatMoney(stats.inventoryVarianceValue) : "R0,00", "/inventory/counts"],
  ];

  const inventoryActions = (
    <>
      <Link href="/inventory/stock" className="inline-flex items-center gap-2 rounded-xl border border-transparent vyron-grad-surface px-5 py-3 text-sm font-semibold text-[#F8FAFC]">
        <PackagePlus size={17} />
        Add / Manage Stock Items
      </Link>
      {canPostAdjustment ? (
        <button
          type="button"
          onClick={() => void syncMasters()}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-5 py-3 text-sm font-semibold text-[#334155] disabled:opacity-60"
        >
          <RefreshCcw size={17} />
          {syncing ? "Syncing…" : "Sync from Ingredients & Products"}
        </button>
      ) : null}
      <Link href="/inventory/ledger" className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-5 py-3 text-sm font-semibold text-[#334155]">
        <Boxes size={17} />
        Stock Ledger
      </Link>
      <Link href="/inventory/counts" className="inline-flex items-center gap-2 rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-5 py-3 text-sm font-semibold text-[var(--vyron-warning-fg)]">
        <ClipboardList size={17} />
        Stock Counts
      </Link>
    </>
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        badge: "Premium Inventory Workspace",
        title: "Inventory Control",
        subtitle: "Stock master, opening stock, weighted-average valuation, ledger movements and stock counts — the financial truth of what you hold.",
        outcomes: [
          "Value inventory at weighted average cost",
          "Monitor low stock and negative risk",
          "Sync stock items from ingredient and product masters",
          "Run stock counts and post variances",
        ],
        quotes: VYRON_DOMAIN_QUOTES.inventory,
        controlTitle: "Inventory Control",
        formulaEyebrow: "Valuation",
        formulaTitle: "How stock value is calculated",
        formulas: [
          { label: "Weighted Avg Cost", formula: "(Prior value + Receipt value) ÷ Total qty" },
          { label: "Inventory Value", formula: "On-hand qty × weighted average unit cost" },
          { label: "Variance", formula: "Count qty − System qty × unit cost" },
        ],
      }}
      actions={inventoryActions}
    >
      {message ? (
        <div className="rounded-xl border border-violet-400/25 bg-[var(--vyron-warning-solid)]/15 px-5 py-4 text-sm font-semibold text-violet-200">
          {message}
        </div>
      ) : null}

      <VyronPremiumFormulaCard
        variant="dark"
        eyebrow="Turns & risk"
        title="Operational health signals"
        formulas={[
          { label: "Inventory Turns", formula: "COGS (period) ÷ Average inventory value" },
          { label: "Low Stock", formula: "On-hand qty below reorder level" },
          { label: "Negative Risk", formula: "Ledger movements that would drive qty below zero" },
        ]}
      />

      <VyronPremiumSectionHeading eyebrow="Live metrics" title="Inventory snapshot" subtitle="Tap any card to open stock, ledger or counts." />

      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(([label, value, href]) => (
          <VyronPremiumMetricCard key={label} label={label} value={value} href={href} />
        ))}
      </div>

      <p className="rounded-xl border border-[rgba(15,23,42,0.09)] bg-white/80 px-5 py-4 text-sm font-medium leading-6 text-[#334155]">
        Valuation: weighted average active. FIFO and standard cost settings remain available in stock item detail screens.
      </p>
    </VyronPremiumPageShell>
  );
}
