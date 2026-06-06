"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

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
  const [stats, setStats] = useState<Stats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    fetch("/api/inventory/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function syncMasters() {
    setSyncing(true);
    const res = await fetch("/api/inventory/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const data = await res.json();
    setMessage(data.ok ? `Synced ${data.created} new stock item(s) from masters.` : data.error || "Sync failed");
    setSyncing(false);
    refresh();
  }

  const cards = [
    ["Total Inventory Value", stats ? formatMoney(stats.totalInventoryValue) : "…", "/inventory/stock"],
    ["Raw Material Value", stats ? formatMoney(stats.rawMaterialValue ?? stats.ingredientsValue + stats.packagingValue) : "…", "/inventory/stock?entityType=ingredient"],
    ["Finished Goods Value", stats ? formatMoney(stats.finishedGoodsValue) : "…", "/inventory-intelligence/finished-goods"],
    ["Inventory Turns", stats ? `${stats.inventoryTurns ?? stats.stockTurnover}x` : "…", "/inventory/ledger"],
    ["Low Stock", stats ? String(stats.lowStockItems) : "…", "/inventory/alerts"],
    ["Negative Stock Risks", stats ? String(stats.negativeStockRisks ?? 0) : "…", "/inventory/stock?status=Out%20Of%20Stock"],
    ["Out Of Stock", stats ? String(stats.outOfStockItems) : "…", "/inventory/stock?status=Out%20Of%20Stock"],
    ["Overstock", stats ? String(stats.overstockItems) : "…", "/inventory/alerts"],
    ["Slow Moving", stats ? String(stats.slowMovingItems) : "…", "/inventory/alerts"],
    ["Variance Value", stats ? formatMoney(stats.inventoryVarianceValue) : "…", "/inventory/counts"],
  ];

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncMasters()}
          className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {syncing ? "Syncing…" : "Sync stock from ingredients & products"}
        </button>
        <Link href="/inventory/stock" className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">
          Stock Master
        </Link>
        <Link href="/inventory/ledger" className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">
          Stock Ledger
        </Link>
        <Link href="/inventory/counts" className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">
          Stock Counts
        </Link>
      </div>
      {message ? <p className="text-sm font-bold text-violet-700">{message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:border-violet-300"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
            {label === "Total Inventory Value" && stats ? (
              <div className="mt-1 text-xs font-semibold text-slate-500">Turnover (90d): {stats.stockTurnover}x</div>
            ) : null}
          </Link>
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-500">
        Valuation: weighted average (active). FIFO and standard cost ready in stock item settings.
      </p>
    </section>
  );
}
