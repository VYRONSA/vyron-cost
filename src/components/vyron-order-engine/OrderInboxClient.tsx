"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Plus, RefreshCw, Search } from "lucide-react";
import type { IntakeStatus } from "@/lib/order-engine/types";
import {
  Card,
  IntakeStatusPill,
  KpiCard,
  Notice,
  NotEnabledNotice,
  OrderEngineTabs,
  Pill,
  SecondaryButton,
  SOURCE_LABEL,
  when,
} from "@/components/vyron-order-engine/ui";

export type InboxView = "inbox" | "approvals" | "exceptions" | "approved" | "confirmed" | "closed" | "all";

type Row = {
  id: string;
  intake_number: string;
  source: string;
  source_reference: string | null;
  external_order_number: string | null;
  customer_po_number: string | null;
  customer_name: string | null;
  requested_delivery_date: string | null;
  status: IntakeStatus;
  blocking_issue_count: number;
  warning_issue_count: number;
  sales_order_id: string | null;
  created_at: string;
  line_count: number;
};

type SourceInfo = { source: string; label: string; state: "READY" | "NOT_CONNECTED" | "COMING_SOON"; detail: string };

type Filters = { search: string; source: string; from: string; to: string; issues: "" | "blocking" | "warnings" };

type ListResult = {
  rows: Row[];
  counts: Record<IntakeStatus, number> | null;
  hasMore: boolean;
  notEnabled: boolean;
  error: string | null;
};

const VIEWS: Array<{ key: InboxView; label: string }> = [
  { key: "inbox", label: "Inbox" },
  { key: "approvals", label: "Awaiting approval" },
  { key: "exceptions", label: "Exceptions" },
  { key: "approved", label: "Approved" },
  { key: "confirmed", label: "Confirmed" },
  { key: "closed", label: "Rejected / cancelled" },
  { key: "all", label: "All" },
];

const PAGE = 50;
const EMPTY_FILTERS: Filters = { search: "", source: "", from: "", to: "", issues: "" };

/** Pure fetch: returns the result, sets no state. */
async function fetchIntakeList(view: InboxView, filters: Filters, offset: number): Promise<ListResult> {
  const params = new URLSearchParams({ view, limit: String(PAGE), offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  try {
    const res = await fetch(`/api/order-intake?${params}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return { rows: [], counts: null, hasMore: false, notEnabled: true, error: null };
    if (!res.ok || !data.ok) return { rows: [], counts: null, hasMore: false, notEnabled: false, error: data.error || "Could not load orders." };
    return { rows: data.rows || [], counts: data.counts || null, hasMore: Boolean(data.hasMore), notEnabled: false, error: null };
  } catch (e) {
    return { rows: [], counts: null, hasMore: false, notEnabled: false, error: e instanceof Error ? e.message : "Could not load orders." };
  }
}

async function fetchSources(): Promise<SourceInfo[]> {
  try {
    const res = await fetch("/api/order-intake/sources", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok ? data.sources : [];
  } catch {
    return [];
  }
}

const STATE_TONE = { READY: "green", NOT_CONNECTED: "amber", COMING_SOON: "slate" } as const;
const STATE_LABEL = { READY: "Ready", NOT_CONNECTED: "Not connected", COMING_SOON: "Coming soon" } as const;

export default function OrderInboxClient({ initialView, canCreate }: { initialView: InboxView; canCreate: boolean }) {
  const [view, setView] = useState<InboxView>(initialView);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ListResult>({ rows: [], counts: null, hasMore: false, notEnabled: false, error: null });
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<SourceInfo[]>([]);

  const apply = useCallback((next: ListResult) => {
    setResult((current) => ({ ...next, counts: next.counts || current.counts }));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchIntakeList(view, filters, offset).then((next) => {
      if (!cancelled) apply(next);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, view, filters, offset]);

  useEffect(() => {
    let cancelled = false;
    fetchSources().then((list) => {
      if (!cancelled) setSources(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeView = (next: InboxView) => {
    if (next === view) return;
    setLoading(true);
    setOffset(0);
    setView(next);
  };
  const runSearch = () => {
    setLoading(true);
    setOffset(0);
    setFilters(draft);
  };
  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setLoading(true);
    setOffset(0);
    setFilters(EMPTY_FILTERS);
  };
  const refresh = () => {
    setLoading(true);
    void fetchIntakeList(view, filters, offset).then(apply);
  };
  const page = (delta: number) => {
    setLoading(true);
    setOffset((current) => Math.max(0, current + delta * PAGE));
  };

  const counts = result.counts;
  const count = (...statuses: IntakeStatus[]) => (counts ? statuses.reduce((sum, s) => sum + (counts[s] || 0), 0) : 0);
  const filtered = useMemo(() => Object.values(filters).some(Boolean), [filters]);
  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800";

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Order Inbox</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
            Customer orders are checked here — customer, products, prices, stock, production and margin — and approved before they become sales
            orders. Nothing is reserved, invoiced or posted from this screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={refresh} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </SecondaryButton>
          {canCreate && !result.notEnabled ? (
            <>
              <Link href="/order-inbox/new?mode=csv" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <FileUp size={15} /> Import CSV
              </Link>
              <Link href="/order-inbox/new" className="inline-flex items-center gap-2 rounded-2xl vyron-grad-surface px-5 py-2.5 text-sm font-semibold text-white">
                <Plus size={16} /> New order
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <OrderEngineTabs active="inbox" />

      {result.notEnabled ? <NotEnabledNotice /> : null}
      {result.error ? <Notice tone="error">{result.error}</Notice> : null}

      {!result.notEnabled ? (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard label="Needs review" value={String(count("RECEIVED"))} active={view === "inbox"} onClick={() => changeView("inbox")} />
          <KpiCard label="Exceptions" value={String(count("EXCEPTION"))} active={view === "exceptions"} onClick={() => changeView("exceptions")} />
          <KpiCard label="Awaiting approval" value={String(count("AWAITING_APPROVAL", "ON_HOLD"))} active={view === "approvals"} onClick={() => changeView("approvals")} />
          <KpiCard label="Approved, not handed off" value={String(count("APPROVED"))} active={view === "approved"} onClick={() => changeView("approved")} />
          <KpiCard label="Confirmed" value={String(count("CONFIRMED"))} active={view === "confirmed"} onClick={() => changeView("confirmed")} />
        </section>
      ) : null}

      {!result.notEnabled ? (
        <Card>
          <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => changeView(v.key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-black ${view === v.key ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <form
            className="mt-4 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch();
            }}
          >
            <label className="relative">
              <span className="sr-only">Search</span>
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} placeholder="Order number, PO or customer" className={`${inputClass} w-full pl-9`} />
            </label>
            <select aria-label="Source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} className={inputClass}>
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input aria-label="Received from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
            <input aria-label="Received to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
            <select aria-label="Issues" value={draft.issues} onChange={(e) => setDraft({ ...draft, issues: e.target.value as Filters["issues"] })} className={inputClass}>
              <option value="">Any issues</option>
              <option value="blocking">Has blocking issues</option>
              <option value="warnings">Has warnings</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl vyron-grad-surface px-4 py-2 text-sm font-semibold text-white">
                Filter
              </button>
              {filtered ? (
                <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
                  Clear
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[1.1fr_1.6fr_1fr_0.8fr_0.5fr_1.3fr_1fr] gap-3 border-b border-slate-100 pb-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                <div>Order</div>
                <div>Customer</div>
                <div>PO / reference</div>
                <div>Source</div>
                <div>Lines</div>
                <div>Status</div>
                <div>Received</div>
              </div>
              {loading ? <div className="py-8 text-center text-sm font-semibold text-slate-400">Loading…</div> : null}
              {!loading && result.rows.length === 0 ? (
                <div className="py-10 text-center text-sm font-semibold text-slate-400">{filtered ? "No orders match these filters." : "No orders in this view."}</div>
              ) : null}
              {!loading &&
                result.rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/order-inbox/${row.id}`}
                    className="grid grid-cols-[1.1fr_1.6fr_1fr_0.8fr_0.5fr_1.3fr_1fr] items-center gap-3 border-b border-slate-50 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <div className="font-black text-slate-900">{row.intake_number}</div>
                    <div className="truncate">{row.customer_name || <span className="text-slate-400">Not stated</span>}</div>
                    <div className="truncate">{row.customer_po_number || row.external_order_number || "—"}</div>
                    <div>
                      <Pill>{SOURCE_LABEL[row.source] || row.source}</Pill>
                    </div>
                    <div>{row.line_count}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <IntakeStatusPill status={row.status} />
                      {row.blocking_issue_count > 0 ? <Pill tone="rose">{row.blocking_issue_count} blocking</Pill> : null}
                      {row.blocking_issue_count === 0 && row.warning_issue_count > 0 ? <Pill tone="amber">{row.warning_issue_count} warning</Pill> : null}
                    </div>
                    <div className="text-xs text-slate-500">{when(row.created_at)}</div>
                  </Link>
                ))}
            </div>
          </div>
          {!loading && (offset > 0 || result.hasMore) ? (
            <div className="mt-4 flex items-center justify-between text-sm font-semibold text-slate-500">
              <span>
                Showing {offset + 1}–{offset + result.rows.length}
              </span>
              <div className="flex gap-2">
                <SecondaryButton onClick={() => page(-1)} disabled={offset === 0}>
                  Previous
                </SecondaryButton>
                <SecondaryButton onClick={() => page(1)} disabled={!result.hasMore}>
                  Next
                </SecondaryButton>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {sources.length ? (
        <Card title="Order sources">
          <div className="grid gap-3 md:grid-cols-3">
            {sources.map((s) => (
              <div key={s.source} className="rounded-2xl border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">{s.label}</span>
                  <Pill tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Pill>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">{s.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
