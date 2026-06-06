"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

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
    fetch("/api/inventory/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cards: Array<[string, string, string, string?]> = [
    ["Raw Material Value", stats ? formatMoney(stats.rawMaterialValue) : "…", "/inventory/stock?entityType=ingredient"],
    ["Finished Goods Value", stats ? formatMoney(stats.finishedGoodsValue) : "…", "/inventory-intelligence/finished-goods"],
    ["Total Inventory Value", stats ? formatMoney(stats.totalInventoryValue) : "…", "/inventory"],
    [
      "Inventory Turns",
      stats ? `${stats.inventoryTurns ?? stats.stockTurnover}x` : "…",
      "/inventory/ledger",
      "90-day COGS / inventory value",
    ],
    ["Low Stock Items", stats ? String(stats.lowStockItems) : "…", "/inventory/alerts"],
    ["Negative Stock Risks", stats ? String(stats.negativeStockRisks) : "…", "/inventory/stock?status=Out%20Of%20Stock"],
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value, href, note]) => (
        <Link
          key={label}
          href={href}
          className={`rounded-[2rem] border p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:border-violet-300 ${
            label === "Negative Stock Risks" && stats && stats.negativeStockRisks > 0
              ? "border-red-200 bg-red-50/40"
              : label === "Low Stock Items" && stats && stats.lowStockItems > 0
                ? "border-amber-200 bg-amber-50/40"
                : "border-violet-100 bg-white"
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          {note ? <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div> : null}
        </Link>
      ))}
    </section>
  );
}
