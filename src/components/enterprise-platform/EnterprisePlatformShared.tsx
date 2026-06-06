"use client";

import Link from "next/link";
import type { ExplainableInsight } from "@/lib/vyron-enterprise-platform-architecture";

export function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export function InsightCard({ insight }: { insight: ExplainableInsight }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="font-black text-slate-900">{insight.title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-700">{insight.body}</p>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
        <div>Formula: {insight.formula}</div>
        <div className="mt-1">Confidence: {insight.confidence}%</div>
      </div>
      {insight.href ? (
        <Link href={insight.href} className="mt-2 inline-block text-xs font-black text-violet-700">
          View →
        </Link>
      ) : null}
    </article>
  );
}

export function PlatformNav() {
  const links = [
    ["/enterprise-platform", "Hub"],
    ["/enterprise-platform/multi-company", "Multi-Company"],
    ["/enterprise-platform/group-reporting", "Group Reporting"],
    ["/enterprise-platform/intercompany", "Intercompany"],
    ["/enterprise-platform/benchmarking", "Benchmarking"],
    ["/enterprise-platform/global-permissions", "Global Permissions"],
    ["/enterprise-platform/data-warehouse", "Data Warehouse"],
    ["/enterprise-platform/command-centre", "Command Centre"],
    ["/enterprise-platform/search", "Enterprise Search"],
    ["/enterprise-platform/knowledge-graph", "Knowledge Graph"],
    ["/enterprise-platform/ai-assistant", "Enterprise AI"],
    ["/enterprise-platform/performance", "Performance"],
    ["/enterprise-platform/foundation", "Platform Foundation"],
  ] as const;
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black hover:bg-violet-50">
          {label}
        </Link>
      ))}
    </nav>
  );
}
