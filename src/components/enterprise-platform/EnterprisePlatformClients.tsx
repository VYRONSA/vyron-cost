"use client";

import { useState } from "react";
import Link from "next/link";
import type { EnterprisePlatformPayload, EnterpriseSearchResult } from "@/lib/vyron-enterprise-platform-architecture";
import { InsightCard, money, PlatformNav, EP_BODY, EP_CARD, EP_CARD_LG, EP_INPUT, EP_LABEL, EP_MUTED, EP_SECTION_TITLE, EP_TABLE, EP_TABLE_HEAD, EP_TABLE_ROW, EP_TABLE_WRAP, EP_VALUE } from "./EnterprisePlatformShared";
import { VYRON_BTN, VYRON_STATUS, VYRON_SURFACE, VYRON_TABLE } from "@/components/vyron-ui";

export { PlatformNav };

export function EnterpriseHubClient({ data }: { data: EnterprisePlatformPayload }) {
  return (
    <section className="grid gap-8">
      <div className={`${VYRON_SURFACE.darkShell} bg-gradient-to-br from-[#1e1635] via-[#252040] to-[#1a1033] p-8`}>
        <div className="text-xs font-black uppercase tracking-widest text-violet-300">Enterprise Platform</div>
        <h2 className="mt-2 text-3xl font-black text-[#F8FAFC]">{data.multiCompany.groupName}</h2>
        <p className={`mt-2 ${EP_BODY}`}>
          Mode: {data.multiCompany.mode} · {data.multiCompany.units.length} org units · Performance readiness{" "}
          {data.performance.readinessPct}%
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {data.groupReporting.consolidated.slice(0, 6).map((m) => (
          <div key={m.key} className={EP_CARD}>
            <div className={EP_LABEL}>{m.label}</div>
            <div className={EP_VALUE}>
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
      <div className={`rounded-2xl border border-violet-400/30 bg-violet-500/15 p-6`}>
        <p className={`text-sm font-bold text-violet-200`}>
          Structure: {data.structureType} · Supported: single company, multi-company, group, holding, subsidiaries, divisions, branches
        </p>
      </div>
      <div className="space-y-3">
        {data.units.map((u) => (
          <div
            key={u.id}
            className={`${EP_CARD} p-4 ${u.isPrimary ? "ring-2 ring-violet-400/50" : ""}`}
            style={{ marginLeft: u.unitType === "branch" ? 24 : u.unitType === "division" ? 12 : 0 }}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className={EP_LABEL}>{u.unitType}</span>
                <div className="font-black text-[#F8FAFC]">{u.unitLabel}</div>
                {u.isPrimary ? <span className="text-xs font-bold text-[#A855F7]">Primary · live data</span> : null}
              </div>
              <span className={`text-xs font-bold ${EP_MUTED}`}>{u.industry}</span>
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
        <h2 className={EP_SECTION_TITLE}>Consolidated group metrics</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.consolidated.map((m) => (
            <div key={m.key} className={EP_CARD}>
              <div className={EP_LABEL}>{m.label}</div>
              <div className={EP_VALUE}>{m.unit === "ZAR" ? money(m.value) : m.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className={EP_SECTION_TITLE}>By entity</h2>
        <div className="mt-4 space-y-4">
          {data.byUnit.map((u) => (
            <div key={u.unitKey} className={EP_CARD_LG}>
              <h3 className="font-black text-[#F8FAFC]">{u.unitLabel}</h3>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#CBD5E1]">
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
    <div className={EP_TABLE_WRAP}>
      <table className={EP_TABLE}>
        <thead className={EP_TABLE_HEAD}>
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
            <tr key={r.id} className={EP_TABLE_ROW}>
              <td className="px-4 py-3 capitalize font-bold text-[#F8FAFC]">{r.type}</td>
              <td className="px-4 py-3">{r.fromUnit}</td>
              <td className="px-4 py-3">{r.toUnit}</td>
              <td className="px-4 py-3">
                {r.href ? (
                  <Link href={r.href} className="font-bold text-violet-300">
                    {r.reference}
                  </Link>
                ) : (
                  r.reference
                )}
              </td>
              <td className="px-4 py-3 font-black text-[#F8FAFC]">{money(r.amount)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${r.status === "Posted" || r.status === "Matched" ? VYRON_STATUS.lime : VYRON_STATUS.brand}`}>
                  {r.status}
                </span>
              </td>
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
          <h2 className={EP_SECTION_TITLE}>{eng.dimension}</h2>
          <div className={`mt-4 ${EP_TABLE_WRAP}`}>
            <table className={EP_TABLE}>
              <thead className={EP_TABLE_HEAD}>
                <tr>
                  <th className="px-4 py-2 text-left">Rank</th>
                  <th className="px-4 py-2 text-left">Unit</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {eng.rows.map((r) => (
                  <tr
                    key={r.unitKey}
                    className={
                      r.isBest
                        ? "bg-[#A855F7]/10"
                        : r.isWorst
                          ? "bg-red-500/10"
                          : EP_TABLE_ROW
                    }
                  >
                    <td className="px-4 py-2 font-black text-[#F8FAFC]">{r.rank}</td>
                    <td className="px-4 py-2 font-bold text-[#CBD5E1]">{r.unitLabel}</td>
                    <td className={`px-4 py-2 text-right font-black ${r.isBest ? "text-[#A855F7]" : r.isWorst ? "text-red-300" : "text-[#F8FAFC]"}`}>
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
    <div className={`overflow-x-auto ${EP_TABLE_WRAP}`}>
      <table className={`min-w-[800px] ${EP_TABLE} text-xs`}>
        <thead className={EP_TABLE_HEAD}>
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
            <tr key={row.roleKey} className={EP_TABLE_ROW}>
              <td className="px-3 py-2 font-black text-[#F8FAFC]">{row.roleName}</td>
              <td className="px-3 py-2">{row.scope}</td>
              {row.modules.map((m) => (
                <td key={m.moduleKey} className="px-2 py-2 text-center">
                  {m.view ? (
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${m.approve ? VYRON_STATUS.lime : m.edit ? VYRON_STATUS.brand : VYRON_STATUS.neutral}`}>
                      {m.approve ? "A" : m.edit ? "E" : "V"}
                    </span>
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`p-3 ${EP_MUTED}`}>V=view · E=edit · A=approve</p>
    </div>
  );
}

export function DataWarehouseClient({ layers }: { layers: EnterprisePlatformPayload["dataWarehouse"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {layers.map((l) => (
        <div key={l.layerKey} className={EP_CARD_LG}>
          <h3 className="font-black text-[#F8FAFC]">{l.layerLabel}</h3>
          <p className={`mt-2 ${EP_BODY}`}>{l.description}</p>
          <p className={`mt-3 text-xs font-bold ${EP_MUTED}`}>
            Retention: {l.retentionPolicy} · Refresh: {l.refreshInterval}
          </p>
          <p className={`mt-1 ${EP_MUTED}`}>~{l.recordEstimate.toLocaleString()} records est.</p>
          <p className={`mt-2 font-mono text-[10px] ${EP_MUTED}`}>{l.sourceTables.join(", ")}</p>
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
        <div key={title} className={EP_CARD_LG}>
          <h3 className="text-lg font-black text-[#F8FAFC]">{title}</h3>
          <dl className="mt-4 space-y-2">
            {metrics.map((m) => (
              <div key={m.key} className="flex justify-between text-sm">
                <dt className="font-bold text-[#94A3B8]">{m.label}</dt>
                <dd className="font-black text-[#F8FAFC]">
                  {m.href ? (
                    <Link href={m.href} className="text-violet-300 hover:underline">
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
          className={EP_INPUT}
        />
        <button type="button" disabled={busy} onClick={search} className={`${VYRON_BTN.primary} disabled:opacity-50`}>
          Search
        </button>
      </div>
      <ul className="mt-6 space-y-2">
        {results.map((r) => (
          <li key={`${r.entityType}-${r.id}`}>
            <Link href={r.href} className={`block ${EP_CARD} transition hover:border-violet-400/30`}>
              <span className="text-xs font-black uppercase text-violet-300">{r.entityType}</span>
              <div className="font-black text-[#F8FAFC]">{r.label}</div>
              <p className={EP_BODY}>{r.detail}</p>
              {r.companyLabel ? <p className={EP_MUTED}>{r.companyLabel}</p> : null}
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
      <div className={`${VYRON_SURFACE.darkShell} bg-gradient-to-br from-[#1e1635] via-[#252040] to-[#1a1033] p-8`}>
        <h2 className="font-black text-[#F8FAFC]">Supply chain → financial impact</h2>
        <div className="mt-8 space-y-4">
          {graph.nodes.map((n, i) => (
            <div key={n.id} className="flex items-center gap-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/20 text-xs font-black text-violet-200">{i + 1}</span>
              <div>
                <div className="text-xs uppercase text-violet-300">{n.type}</div>
                {n.href ? (
                  <Link href={n.href} className="font-black text-[#F8FAFC] hover:underline">
                    {n.label}
                  </Link>
                ) : (
                  <div className="font-black text-[#F8FAFC]">{n.label}</div>
                )}
              </div>
              {i < graph.nodes.length - 1 ? <div className="ml-4 text-violet-400">↓</div> : null}
            </div>
          ))}
        </div>
      </div>
      <div className={EP_CARD}>
        <h3 className="font-black text-[#F8FAFC]">Relationships</h3>
        <ul className={`mt-3 space-y-2 text-xs font-bold ${EP_MUTED}`}>
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
          <button key={p.question} type="button" disabled={busy} onClick={() => ask(p.question)} className={`block w-full ${EP_CARD} text-left text-sm font-bold text-[#CBD5E1] transition hover:border-violet-400/30 disabled:opacity-50`}>
            {p.question}
          </button>
        ))}
      </div>
      <div className={`${VYRON_SURFACE.darkShell} bg-gradient-to-br from-[#1e1635] via-[#252040] to-[#1a1033] p-8`}>
        <h2 className="text-xl font-black text-[#F8FAFC]">VYRON Enterprise AI</h2>
        {answer ? (
          <>
            <p className={`mt-4 leading-8 ${EP_BODY}`}>{answer.answer}</p>
            <div className="mt-6 rounded-xl border border-white/10 bg-[#252040]/80 p-4 text-xs text-[#94A3B8]">
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
        <div className={EP_CARD_LG}>
          <div className={EP_LABEL}>Target invoices</div>
          <div className="mt-2 text-3xl font-black text-[#F8FAFC]">{perf.targetInvoices.toLocaleString()}+</div>
          <p className={`mt-1 ${EP_MUTED}`}>Current est. {perf.currentInvoicesEstimate.toLocaleString()}</p>
        </div>
        <div className={EP_CARD_LG}>
          <div className={EP_LABEL}>Target transactions</div>
          <div className="mt-2 text-3xl font-black text-[#F8FAFC]">{(perf.targetTransactions / 1_000_000).toFixed(1)}M+</div>
          <p className={`mt-1 ${EP_MUTED}`}>Current est. {perf.currentTransactionsEstimate.toLocaleString()}</p>
        </div>
        <div className={`${EP_CARD_LG} border border-violet-400/30 bg-violet-500/15`}>
          <div className={`${EP_LABEL} text-violet-200`}>Readiness</div>
          <div className="mt-2 text-3xl font-black text-[#A855F7]">{perf.readinessPct}%</div>
        </div>
      </div>
      <ul className="space-y-2">
        {perf.strategies.map((s) => (
          <li key={s} className={`rounded-xl border border-white/10 bg-[#1e1635] px-4 py-3 text-sm font-bold text-[#CBD5E1]`}>
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
          <span key={s} className={`rounded-full px-4 py-2 text-sm font-black ${VYRON_STATUS.brand}`}>
            {s}
          </span>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {foundation.products.map((p) => (
          <div key={p.productKey} className={EP_CARD_LG}>
            <div className="flex justify-between gap-2">
              <h3 className="font-black text-[#F8FAFC]">{p.productName}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ${p.status === "active" ? VYRON_STATUS.lime : VYRON_STATUS.neutral}`}>
                {p.status}
              </span>
            </div>
            <p className={`mt-2 ${EP_BODY}`}>{p.description}</p>
            <p className={`mt-3 text-xs font-bold ${EP_MUTED}`}>Shared: {p.sharedEntities.join(", ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
