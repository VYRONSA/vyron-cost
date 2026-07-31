"use client";

import Link from "next/link";
import type { FinanceExplainableInsight, StatementLine } from "@/lib/vyron-finance-intelligence-layer";

export function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export function InsightCard({ insight }: { insight: FinanceExplainableInsight }) {
  const sev =
    insight.severity === "critical"
      ? "border-red-300 bg-red-50"
      : insight.severity === "high"
        ? "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)]"
        : "border-slate-200 bg-white";
  return (
    <article className={`rounded-2xl border p-5 ${sev}`}>
      <div className="text-[10px] font-black uppercase text-slate-500">{insight.category}</div>
      <h3 className="mt-1 font-black text-slate-900">{insight.title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-700">{insight.body}</p>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
        <div>Formula: {insight.formula}</div>
        <div className="mt-1">Confidence: {insight.confidence}%</div>
      </div>
      {insight.href ? (
        <Link href={insight.href} className="mt-3 inline-block text-xs font-black text-violet-700">
          Investigate →
        </Link>
      ) : null}
    </article>
  );
}

export function StatementTable({ lines, title }: { lines: StatementLine[]; title: string }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="font-black text-slate-900">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.key}
              className={`border-t border-slate-50 ${line.isTotal ? "bg-slate-950 text-white" : line.isSubtotal ? "bg-slate-50 font-black" : ""}`}
            >
              <td className="px-6 py-3" style={{ paddingLeft: `${24 + (line.indent || 0) * 16}px` }}>
                {line.label}
              </td>
              <td className="px-6 py-3 text-right font-black">{money(line.amount)}</td>
              <td className="px-6 py-3 text-right text-slate-500">
                {line.pctOfRevenue != null ? `${line.pctOfRevenue.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceNav() {
  const links = [
    ["/vyron-finance", "Hub"],
    ["/vyron-finance/management-accounts", "Management Accounts"],
    ["/vyron-finance/statements", "Statements"],
    ["/vyron-finance/financial-review", "AI Review"],
    ["/vyron-finance/audit-intelligence", "Audit"],
    ["/vyron-finance/imports", "Imports"],
    ["/vyron-finance/trial-balance", "Trial Balance"],
    ["/vyron-finance/cash-flow", "Cash Flow"],
    ["/vyron-finance/executive", "Executive"],
    ["/vyron-finance/board-reporting", "Board Packs"],
    ["/vyron-finance/cfo-assistant", "CFO Assistant"],
    ["/vyron-finance/foundation", "VYRON FINANCE"],
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
