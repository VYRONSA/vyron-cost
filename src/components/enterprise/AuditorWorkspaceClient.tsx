"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuditorSearchResult } from "@/lib/vyron-enterprise-platform";

const QUICK_LINKS = [
  ["Invoices", "/document-intelligence"],
  ["Purchase Orders", "/purchase-orders/list"],
  ["GRNs", "/goods-receipts/history"],
  ["Stock Counts", "/inventory/counts"],
  ["Inventory", "/inventory"],
  ["Production", "/manufacturing"],
  ["Audit Trail", "/audit-logs"],
];

export default function AuditorWorkspaceClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuditorSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/enterprise/auditor-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.ok) setResults(data.results);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-8">
      <div className="rounded-[2rem] border-2 border-dashed border-violet-300 bg-violet-50 p-6">
        <div className="text-xs font-black uppercase text-violet-700">Auditor mode — read only</div>
        <p className="mt-2 text-sm font-semibold text-violet-900">Search and drill into records without edit permissions.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS.map(([label, href]) => (
          <Link key={href} href={href} className="rounded-xl bg-white px-4 py-2 text-xs font-black shadow-sm hover:bg-violet-50">
            {label}
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search supplier, PO, invoice, GRN…"
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold"
        />
        <button type="button" onClick={search} disabled={loading} className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white disabled:opacity-50">
          {loading ? "…" : "Search"}
        </button>
      </div>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={`${r.entityType}-${r.id}`}>
            <Link href={r.href} className="block rounded-xl bg-white p-4 shadow-sm hover:bg-violet-50">
              <span className="text-[10px] font-black uppercase text-violet-600">{r.entityType}</span>
              <div className="font-black text-slate-900">{r.label}</div>
              <div className="text-sm text-slate-600">{r.detail}</div>
            </Link>
          </li>
        ))}
        {!results.length && query ? <li className="text-sm font-bold text-slate-500">No results — try a supplier name or PO number.</li> : null}
      </ul>
    </section>
  );
}
