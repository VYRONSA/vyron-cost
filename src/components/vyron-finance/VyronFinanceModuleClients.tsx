"use client";

import { useState } from "react";
import BoardPackGeneratorClient from "@/components/BoardPackGeneratorClient";
import type { VyronFinanceIntelligencePayload } from "@/lib/vyron-finance-intelligence-layer";
import { InsightCard, money } from "./VyronFinanceShared";

export function FinancialReviewClient({ insights }: { insights: VyronFinanceIntelligencePayload["financialReview"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </div>
  );
}

export function AuditIntelligenceClient({ findings }: { findings: VyronFinanceIntelligencePayload["auditIntelligence"] }) {
  return (
    <div className="space-y-4">
      {findings.map((f) => (
        <article key={f.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap justify-between gap-2">
            <span className="text-xs font-black uppercase text-red-600">{f.findingType.replace(/_/g, " ")}</span>
            <span className="font-black text-red-700">{money(f.exposure)} exposure</span>
          </div>
          <h3 className="font-black">{f.title}</h3>
          <p className="mt-2 text-sm text-slate-700">{f.body}</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
            <div>Formula: {f.formula}</div>
            <div className="mt-1">Confidence: {f.confidence}%</div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function TrialBalanceClient({ tb }: { tb: VyronFinanceIntelligencePayload["trialBalance"] }) {
  return (
    <section className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Revenue", tb.summary.revenue],
          ["GP", tb.summary.gp],
          ["Profit", tb.summary.profit],
          ["Cash", tb.summary.cash],
          ["GP %", `${tb.summary.gpPct.toFixed(1)}%`],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{l}</div>
            <div className="mt-1 text-xl font-black">{typeof v === "number" ? money(v) : v}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Account</th>
              <th className="px-4 py-3">Debit</th>
              <th className="px-4 py-3">Credit</th>
              <th className="px-4 py-3">Movement</th>
            </tr>
          </thead>
          <tbody>
            {tb.accounts.map((a) => (
              <tr key={a.accountCode} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{a.accountCode}</td>
                <td className="px-4 py-3 font-bold">{a.accountName}</td>
                <td className="px-4 py-3">{money(a.debit)}</td>
                <td className="px-4 py-3">{money(a.credit)}</td>
                <td className="px-4 py-3 font-black">{money(a.movement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-black">Movements & anomalies</h3>
          <div className="mt-3 space-y-3">
            {[...tb.movements, ...tb.anomalies].map((m) => (
              <InsightCard key={m.id} insight={m} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-black">Risks & recommendations</h3>
          <div className="mt-3 space-y-3">
            {tb.risks.map((r) => (
              <InsightCard key={r.id} insight={r} />
            ))}
            {tb.recommendations.map((r) => (
              <InsightCard key={r.id} insight={r} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CashFlowClient({ cash }: { cash: VyronFinanceIntelligencePayload["cashFlow"] }) {
  return (
    <section className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-violet-600 p-6 text-white">
          <div className="text-xs font-black uppercase opacity-80">30 day cash requirement</div>
          <div className="mt-2 text-3xl font-black">{money(cash.horizon30)}</div>
        </div>
        <div className="rounded-2xl bg-indigo-900 p-6 text-white">
          <div className="text-xs font-black uppercase opacity-80">90 day</div>
          <div className="mt-2 text-3xl font-black">{money(cash.horizon90)}</div>
        </div>
        <div className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="text-xs font-black uppercase opacity-80">12 month</div>
          <div className="mt-2 text-3xl font-black">{money(cash.horizon365)}</div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          ["Supplier payments (30d)", cash.supplierPayments30],
          ["Inventory purchases (30d)", cash.inventoryPurchases30],
          ["Production costs (30d)", cash.productionCosts30],
          ["Recovery impact (30d)", cash.recoveryImpact30],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{l}</div>
            <div className="mt-2 text-xl font-black">{money(Number(v))}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Forecast line</th>
              <th className="px-4 py-3">30d</th>
              <th className="px-4 py-3">90d</th>
              <th className="px-4 py-3">12mo</th>
            </tr>
          </thead>
          <tbody>
            {cash.lines.map((l) => (
              <tr key={l.label} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">{l.label}</td>
                <td className="px-4 py-3 text-center font-black">{money(l.d30)}</td>
                <td className="px-4 py-3 text-center font-black">{money(l.d90)}</td>
                <td className="px-4 py-3 text-center font-black">{money(l.d365)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ExecutiveFinanceClient({ data }: { data: VyronFinanceIntelligencePayload }) {
  const { executive, healthScores, intelligenceScores } = data;
  return (
    <section className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Revenue", executive.revenue],
          ["GP", executive.gp],
          ["GP %", `${executive.gpPct.toFixed(1)}%`],
          ["Net profit", executive.netProfit],
          ["Inventory", executive.inventory],
          ["Cash flow (net)", executive.cashFlowNet],
          ["Recovery", executive.recovery],
          ["Financial health", executive.financialHealthScore],
          ["Risk score", executive.riskScore],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{l}</div>
            <div className="mt-2 text-2xl font-black">{typeof v === "number" ? money(v) : v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-[2rem] bg-slate-50 p-6">
        <h3 className="font-black">VYRON COST intelligence scores (feeds FINANCE)</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(intelligenceScores).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white p-3 text-sm">
              <span className="font-black capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
              <span className="float-right font-black">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(healthScores).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-violet-100 p-3 text-center">
            <div className="text-[10px] font-black uppercase text-violet-800">{k}</div>
            <div className="text-2xl font-black text-violet-950">{v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BoardReportingClient({ packs }: { packs: VyronFinanceIntelligencePayload["boardPacks"] }) {
  const [idx, setIdx] = useState(0);
  const pack = packs[idx];
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {packs.map((p, i) => (
          <button
            key={p.type}
            type="button"
            onClick={() => setIdx(i)}
            className={`rounded-xl px-4 py-2 text-xs font-black ${i === idx ? "bg-violet-600 text-white" : "bg-white text-slate-700"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{pack.description}</p>
      <BoardPackGeneratorClient pack={pack.pack} />
    </section>
  );
}

export function FoundationClient({ foundation }: { foundation: VyronFinanceIntelligencePayload["foundation"] }) {
  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] border-2 border-violet-200 bg-violet-50 p-8">
        <h2 className="text-2xl font-black text-violet-950">{foundation.productName} foundation</h2>
        <p className="mt-2 text-sm text-violet-900">
          Shared entity architecture from VYRON COST — integration ready: {foundation.integrationReady ? "Yes" : "No"}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {foundation.entities.map((e) => (
          <div key={e.key} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="font-black text-slate-900">{e.label}</div>
            <div className="mt-1 font-mono text-xs text-slate-500">{e.sourceTable}</div>
            <p className="mt-2 text-sm text-slate-600">{e.syncNotes}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
