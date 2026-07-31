"use client";

import Link from "next/link";
import type { HeatmapCell } from "@/lib/vyron-executive-command-centre";

const levelStyles: Record<HeatmapCell["level"], string> = {
  low: "bg-[#A855F7]/12 text-[#4D7C0F] border-[#A855F7]/25",
  medium: "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)] border-[var(--vyron-warning-border)]",
  high: "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)] border-[var(--vyron-warning-border)]",
  critical: "bg-red-100 text-red-950 border-red-300",
};

export default function ExecutiveHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const areas = Array.from(new Set(cells.map((c) => c.area)));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {areas.map((area) => (
        <div key={area} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{area}</div>
          <div className="mt-3 grid gap-2">
            {cells
              .filter((c) => c.area === area)
              .map((cell) => {
                const inner = (
                  <div
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold ${levelStyles[cell.level]}`}
                  >
                    <span>{cell.metric}</span>
                    <span>{typeof cell.value === "number" && cell.value > 1000 ? `R${Math.round(cell.value).toLocaleString()}` : cell.value}</span>
                  </div>
                );
                return cell.href ? (
                  <Link key={`${cell.area}-${cell.metric}`} href={cell.href} className="transition hover:opacity-90">
                    {inner}
                  </Link>
                ) : (
                  <div key={`${cell.area}-${cell.metric}`}>{inner}</div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
