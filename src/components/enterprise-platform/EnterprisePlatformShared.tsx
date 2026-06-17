"use client";

import Link from "next/link";
import type { ExplainableInsight } from "@/lib/vyron-enterprise-platform-architecture";
import { VYRON_BTN, VYRON_SURFACE, VYRON_TABLE } from "@/components/vyron-ui";

export function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export const EP_CARD = `${VYRON_SURFACE.dark} p-5 shadow-[0_2px_16px_rgba(0,0,0,0.14)]`;
export const EP_CARD_LG = `${VYRON_SURFACE.dark} p-6 shadow-[0_2px_16px_rgba(0,0,0,0.14)]`;
export const EP_NAV_LINK = `${VYRON_BTN.secondary} px-3 py-2 text-xs font-black`;
export const EP_SECTION_TITLE = "text-xl font-black text-[#F8FAFC]";
export const EP_LABEL = "text-xs font-black uppercase tracking-[0.12em] text-[#94A3B8]";
export const EP_VALUE = "mt-2 text-2xl font-black text-[#F8FAFC]";
export const EP_BODY = "text-sm text-[#CBD5E1]";
export const EP_MUTED = "text-xs text-[#94A3B8]";
export const EP_TABLE_WRAP = `overflow-hidden ${VYRON_SURFACE.dark}`;
export const EP_TABLE = "w-full text-sm text-[#CBD5E1]";
export const EP_TABLE_HEAD = VYRON_TABLE.head;
export const EP_TABLE_ROW = `border-t border-white/10 ${VYRON_TABLE.rowHover}`;
export const EP_INPUT =
  "flex-1 rounded-2xl border border-white/12 bg-[#1e1635] px-4 py-3 font-bold text-[#F8FAFC] placeholder:text-[#94A3B8] outline-none focus:border-violet-400/40";

export function InsightCard({ insight }: { insight: ExplainableInsight }) {
  return (
    <article className={EP_CARD}>
      <h3 className="font-black text-[#F8FAFC]">{insight.title}</h3>
      <p className={`mt-2 leading-7 ${EP_BODY}`}>{insight.body}</p>
      <div className="mt-3 rounded-xl border border-white/10 bg-[#1e1635] p-3 text-xs font-bold text-[#94A3B8]">
        <div>Formula: {insight.formula}</div>
        <div className="mt-1">Confidence: {insight.confidence}%</div>
      </div>
      {insight.href ? (
        <Link href={insight.href} className="mt-2 inline-block text-xs font-black text-violet-300">
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
        <Link key={href} href={href} className={EP_NAV_LINK}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
