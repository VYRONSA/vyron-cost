"use client";

import { useState } from "react";
import Link from "next/link";
import type { EnterprisePlatformPayload, EnterpriseSearchResult } from "@/lib/vyron-enterprise-platform-architecture";
import { InsightCard, money, PlatformNav } from "./EnterprisePlatformShared";

export { PlatformNav };

export function EnterpriseHubClient({ data }: { data: EnterprisePlatformPayload }) {
  return (
    <section className="grid gap-8">
      <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 to-indigo-950 p-8 text-white">
        <div className="text-xs font-black uppercase tracking-widest text-indigo-300">Enterprise Platform</div>
        <h2 className="mt-2 text-3xl font-black">{data.multiCompany.groupName}</h2>
        <p className="mt-2 text-sm text-slate-300">
          Mode: {data.multiCompany.mode} · {data.multiCompany.units.length} org units · Performance readiness{" "}
          {data.performance.readinessPct}%
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {data.groupReporting.consolidated.slice(0, 6).map((m) => (
          <div key={m.key} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{m.label}</div>
            <div className="mt-2 text-2xl font-black">
              {m.unit === "ZAR" ? money(m.value) : m.unit === "%" ? `${m.value}%` : m.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MultiCompanyClient({ data }: { data: EnterprisePlatformPayload["multiCompany"] }) {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl bg-violet-50 p-6">
        <p className="text-sm font-bold text-violet-900">
          Structure: {data.structureType} · Supported: single company, multi-company, group, holding, subsidiaries, divisions, branches
        </p>
      </div>
      <div className="space-y-3">
        {data.units.map((u) => (
          <div
            key={u.id}
            className={`rounded-2xl bg-white p-4 shadow-sm ${u.isPrimary ? "ring-2 ring-violet-400" : ""}`}
            style={{ marginLeft: u.unitType === "branch" ? 24 : u.unitType === "division" ? 12 : 0 }}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className="text-xs font-black uppercase text-slate-400">{u.unitType}</span>
                <div className="font-black text-slate-900">{u.unitLabel}</div>
                {u.isPrimary ? <span className="text-xs font-bold text-violet-600">Primary · live data</span> : null}
              </div>
              <span className="text-xs font-bold text-slate-500">{u.industry}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GroupReportingClient({ data }: { data: EnterprisePlatformPayload["groupReporting"] }) {
  return (
    <section className="grid gap-8">
      <div>
        <h2 className="text-xl font-black">Consolidated group metrics</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.consolidated.map((m) => (
            <div key={m.key} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-400">{m.label}</div>
              <div className="mt-2 text-2xl font-black">{m.unit === "ZAR" ? money(m.value) : m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-xl font-black">By entity</h2>
        <div className="mt-4 space-y-4">
          {data.byUnit.map((u) => (
            <div key={u.unitKey} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="font-black">{u.unitLabel}</h3>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {u.metrics.map((m) => (
                  <span key={m.key} className="font-bold">
                    {m.label}: {m.unit === "ZAR" ? money(m.value) : m.value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IntercompanyClient({ rows }: { rows: EnterprisePlatformPayload["intercompany"] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3">From</th>
            <th className="px-4 py-3">To</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 capitalize font-bold">{r.type}</td>
              <td className="px-4 py-3">{r.fromUnit}</td>
              <td className="px-4 py-3">{r.toUnit}</td>
              <td className="px-4 py-3">
                {r.href ? (
                  <Link href={r.href} className="font-bold text-violet-700">
                    {r.reference}
                  </Link>
                ) : (
                  r.reference
                )}
              </td>
              <td className="px-4 py-3 font-black">{money(r.amount)}</td>
              <td className="px-4 py-3">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BenchmarkingClient({ engines }: { engines: EnterprisePlatformPayload["benchmarking"] }) {
  return (
    <div className="space-y-10">
      {engines.map((eng) => (
        <section key={eng.dimension}>
          <h2 className="text-xl font-black">{eng.dimension}</h2>
          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Rank</th>
                  <th className="px-4 py-2 text-left">Unit</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {eng.rows.map((r) => (
                  <tr key={r.unitKey} className={r.isBest ? "bg-emerald-50" : r.isWorst ? "bg-red-50" : "border-t"}>
                    <td className="px-4 py-2 font-black">{r.rank}</td>
                    <td className="px-4 py-2 font-bold">{r.unitLabel}</td>
                    <td className="px-4 py-2 text-right font-black">
                      {eng.dimension.includes("yield") || eng.dimension.includes("health") ? `${r.metricValue}` : money(r.metricValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {eng.opportunities.map((o) => (
            <div key={o.id} className="mt-3">
              <InsightCard insight={o} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function GlobalPermissionsClient({ matrix }: { matrix: EnterprisePlatformPayload["globalPermissions"] }) {
  return (
    <div className="overflow-x-auto rounded-[2rem] bg-white shadow-sm">
      <table className="min-w-[800px] w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left">Role</th>
            <th className="px-3 py-2">Scope</th>
            {matrix[0]?.modules.map((m) => (
              <th key={m.moduleKey} className="px-2 py-2">
                {m.moduleLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.roleKey} className="border-t">
              <td className="px-3 py-2 font-black">{row.roleName}</td>
              <td className="px-3 py-2">{row.scope}</td>
              {row.modules.map((m) => (
                <td key={m.moduleKey} className="px-2 py-2 text-center">
                  {m.view ? (m.approve ? "A" : m.edit ? "E" : "V") : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-xs text-slate-500">V=view · E=edit · A=approve</p>
    </div>
  );
}

export function DataWarehouseClient({ layers }: { layers: EnterprisePlatformPayload["dataWarehouse"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {layers.map((l) => (
        <div key={l.layerKey} className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-black text-slate-900">{l.layerLabel}</h3>
          <p className="mt-2 text-sm text-slate-600">{l.description}</p>
          <p className="mt-3 text-xs font-bold text-slate-500">
            Retention: {l.retentionPolicy} · Refresh: {l.refreshInterval}
          </p>
          <p className="mt-1 text-xs text-slate-400">~{l.recordEstimate.toLocaleString()} records est.</p>
          <p className="mt-2 font-mono text-[10px] text-slate-400">{l.sourceTables.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}

export function GroupCommandCentreClient({ cc }: { cc: EnterprisePlatformPayload["groupCommandCentre"] }) {
  const sections = [
    ["Procurement", cc.procurement],
    ["Inventory", cc.inventory],
    ["Manufacturing", cc.manufacturing],
    ["Recovery", cc.recovery],
    ["Finance", cc.finance],
    ["Risk", cc.risk],
    ["Compliance", cc.compliance],
    ["AI", cc.ai],
  ] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {sections.map(([title, metrics]) => (
        <div key={title} className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="text-lg font-black">{title}</h3>
          <dl className="mt-4 space-y-2">
            {metrics.map((m) => (
              <div key={m.key} className="flex justify-between text-sm">
                <dt className="font-bold text-slate-600">{m.label}</dt>
                <dd className="font-black">
                  {m.href ? (
                    <Link href={m.href} className="text-violet-700">
                      {m.unit === "ZAR" ? money(m.value) : `${m.value}${m.unit === "%" ? "%" : ""}`}
                    </Link>
                  ) : m.unit === "ZAR" ? (
                    money(m.value)
                  ) : (
                    `${m.value}${m.unit === "%" ? "%" : ""}`
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function EnterpriseSearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<EnterpriseSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const res = await fetch(`/api/enterprise-platform/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.ok) setResults(data.results);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search invoices, POs, suppliers, products, recovery, financials…"
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold"
        />
        <button type="button" disabled={busy} onClick={search} className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">
          Search
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {results.map((r) => (
          <li key={`${r.entityType}-${r.id}`}>
            <Link href={r.href} className="block rounded-xl bg-white p-4 shadow-sm hover:bg-violet-50">
              <span className="text-xs font-black uppercase text-violet-600">{r.entityType}</span>
              <div className="font-black">{r.label}</div>
              <p className="text-sm text-slate-600">{r.detail}</p>
              {r.companyLabel ? <p className="text-xs text-slate-400">{r.companyLabel}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KnowledgeGraphClient({ graph }: { graph: EnterprisePlatformPayload["knowledgeGraph"] }) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[2rem] bg-slate-950 p-8 text-white">
        <h2 className="font-black">Supply chain → financial impact</h2>
        <div className="mt-8 space-y-4">
          {graph.nodes.map((n, i) => (
            <div key={n.id} className="flex items-center gap-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-black">{i + 1}</span>
              <div>
                <div className="text-xs uppercase text-violet-300">{n.type}</div>
                {n.href ? (
                  <Link href={n.href} className="font-black hover:underline">
                    {n.label}
                  </Link>
                ) : (
                  <div className="font-black">{n.label}</div>
                )}
              </div>
              {i < graph.nodes.length - 1 ? <div className="ml-4 text-violet-400">↓</div> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="font-black">Relationships</h3>
        <ul className="mt-3 space-y-2 text-xs font-bold text-slate-600">
          {graph.edges.map((e, i) => (
            <li key={i}>
              {e.from} → {e.to}: {e.relationship}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function EnterpriseAiClient({ presets }: { presets: EnterprisePlatformPayload["enterpriseAi"] }) {
  const [question, setQuestion] = useState(presets[0]?.question || "");
  const [answer, setAnswer] = useState(presets[0] || null);
  const [busy, setBusy] = useState(false);

  async function ask(q: string) {
    setQuestion(q);
    setBusy(true);
    try {
      const res = await fetch("/api/enterprise-platform/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.ok) setAnswer(data.answer);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        {presets.map((p) => (
          <button key={p.question} type="button" disabled={busy} onClick={() => ask(p.question)} className="block w-full rounded-xl bg-white p-4 text-left text-sm font-bold shadow-sm hover:bg-violet-50 disabled:opacity-50">
            {p.question}
          </button>
        ))}
      </div>
      <div className="rounded-[2rem] bg-slate-950 p-8 text-white">
        <h2 className="text-xl font-black">VYRON Enterprise AI</h2>
        {answer ? (
          <>
            <p className="mt-4 text-sm leading-8 text-slate-200">{answer.answer}</p>
            <div className="mt-6 rounded-xl bg-white/10 p-4 text-xs">
              <div>Formula: {answer.formula}</div>
              <div className="mt-1">Confidence: {answer.confidence}%</div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function PerformanceClient({ perf }: { perf: EnterprisePlatformPayload["performance"] }) {
  return (
    <section className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-400">Target invoices</div>
          <div className="mt-2 text-3xl font-black">{perf.targetInvoices.toLocaleString()}+</div>
          <p className="mt-1 text-sm text-slate-500">Current est. {perf.currentInvoicesEstimate.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-400">Target transactions</div>
          <div className="mt-2 text-3xl font-black">{(perf.targetTransactions / 1_000_000).toFixed(1)}M+</div>
          <p className="mt-1 text-sm text-slate-500">Current est. {perf.currentTransactionsEstimate.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-violet-600 p-6 text-white">
          <div className="text-xs font-black uppercase opacity-80">Readiness</div>
          <div className="mt-2 text-3xl font-black">{perf.readinessPct}%</div>
        </div>
      </div>
      <ul className="space-y-2">
        {perf.strategies.map((s) => (
          <li key={s} className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FoundationClient({ foundation }: { foundation: EnterprisePlatformPayload["platformFoundation"] }) {
  return (
    <section className="grid gap-8">
      <div className="flex flex-wrap gap-2">
        {foundation.sharedServices.map((s) => (
          <span key={s} className="rounded-full bg-violet-100 px-4 py-2 text-sm font-black text-violet-900">
            {s}
          </span>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {foundation.products.map((p) => (
          <div key={p.productKey} className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex justify-between">
              <h3 className="font-black">{p.productName}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-black ${p.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                {p.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{p.description}</p>
            <p className="mt-3 text-xs font-bold text-slate-500">Shared: {p.sharedEntities.join(", ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
