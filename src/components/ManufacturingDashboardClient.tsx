"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Factory, AlertTriangle, TrendingDown, Package } from "lucide-react";
import { formatMoney } from "@/lib/vyron-cost-data";

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
    fetch("/api/production/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      });
    fetch("/api/production/insights")
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

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/manufacturing/runs/new" className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
          New Production Run
        </Link>
        <Link href="/manufacturing/history" className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">
          Manufacturing History
        </Link>
        <Link href="/manufacturing/finished-goods" className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">
          Finished Goods
        </Link>
        <Link href="/recipes" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
          Recipes & BOM
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:border-violet-300"
          >
            <Factory className="text-violet-600" size={22} />
            <div className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{label}</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
          </Link>
        ))}
      </div>

      {stats ? (
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
          <div className="flex items-center gap-3">
            <Package className="text-emerald-400" size={28} />
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Finished Goods Inventory Value</div>
              <div className="text-3xl font-black">{formatMoney(stats.finishedGoodsValue)}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs font-bold text-slate-400">Active runs</div>
              <div className="text-2xl font-black text-amber-300">{stats.activeRuns}</div>
            </div>
          </div>
        </div>
      ) : null}

      {insights.length > 0 ? (
        <div className="rounded-[2rem] border border-amber-100 bg-amber-50/50 p-6">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-amber-800">
            <AlertTriangle size={18} /> AI Production Insights
          </div>
          <ul className="mt-4 grid gap-3">
            {insights.map((item, i) => (
              <li key={i} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                <span className="mr-2 rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                  {item.category}
                </span>
                {item.href ? (
                  <Link href={item.href} className="text-violet-700 hover:underline">
                    {item.message}
                  </Link>
                ) : (
                  item.message
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-500">
          <TrendingDown className="mb-2 text-slate-400" size={24} />
          Complete production runs to generate yield, wastage and cost insights.
        </div>
      )}
    </section>
  );
}
