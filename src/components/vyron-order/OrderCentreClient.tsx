"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, ChevronRight, Inbox, ClipboardCheck, Factory, PackageCheck,
  Receipt, TrendingUp, Bell, RefreshCw,
} from "lucide-react";
import type { OrderCentreSummary, OrderCentreRow } from "@/lib/vyron-order-centre";

/**
 * VYRON ORDER CENTRE — the operations view of customer orders.
 *
 * Every order shown is a row in the existing vyron_customer_sales_orders table.
 * There is no second order store and no second set of counters: the tiles are
 * counts over that table, and the statuses are the engine's own.
 *
 * Filtering and paging happen on the server. The browser never receives more
 * than a page of orders, however many the tenant has.
 */

const money = (v: number) =>
  `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

/** Customer-facing wording for a status the engine owns. Presentation only. */
export const STAFF_STATUS_TONE: Record<string, string> = {
  Draft: "bg-blue-50 text-blue-700 border-blue-200",
  "Awaiting Approval": "bg-amber-50 text-amber-800 border-amber-200",
  Approved: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Picking: "bg-violet-50 text-violet-700 border-violet-200",
  Packed: "bg-cyan-50 text-cyan-700 border-cyan-200",
  Dispatched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Partially Invoiced": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Invoiced: "bg-slate-100 text-slate-700 border-slate-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};

const FILTERS = ["All", "New", "In production", "Ready", "Dispatched", "Cancelled"];
const PAGE = 25;

export default function OrderCentreClient() {
  const [summary, setSummary] = useState<OrderCentreSummary | null>(null);
  const [rows, setRows] = useState<OrderCentreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: string, nextSearch: string, nextOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: nextStatus, limit: String(PAGE), offset: String(nextOffset) });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const res = await fetch(`/api/vyron-order/staff/orders?${params}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        setError(body?.error || "We couldn't load orders.");
        return;
      }
      setSummary(body.summary as OrderCentreSummary);
      setRows(body.rows as OrderCentreRow[]);
      setTotal(Number(body.total || 0));
      setError(null);
    } catch {
      setError("We couldn't load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status: "All", limit: String(PAGE), offset: "0" });
    fetch(`/api/vyron-order/staff/orders?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) {
          setSummary(body.summary as OrderCentreSummary);
          setRows(body.rows as OrderCentreRow[]);
          setTotal(Number(body.total || 0));
        } else setError(body?.error || "We couldn't load orders.");
      })
      .catch(() => { if (!cancelled) setError("We couldn't load orders."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => { void load(status, search, 0); setOffset(0); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const tiles = useMemo(() => ([
    { key: "New", label: "New", value: summary?.newOrders ?? 0, icon: <Inbox size={16} />, filter: "New" },
    { key: "To review", label: "To review", value: summary?.toReview ?? 0, icon: <ClipboardCheck size={16} />, filter: "Awaiting Approval" },
    { key: "In production", label: "In production", value: summary?.inProduction ?? 0, icon: <Factory size={16} />, filter: "In production" },
    { key: "Ready", label: "Ready", value: summary?.ready ?? 0, icon: <PackageCheck size={16} />, filter: "Ready" },
    { key: "Unpaid", label: "Unpaid", value: summary?.unpaid ?? 0, icon: <Receipt size={16} />, filter: "Dispatched" },
  ]), [summary]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-950 md:text-2xl">VYRON Order Centre</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Customer orders, live from the VYRON COST sales-order engine.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/order-centre/notifications"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50"
          >
            <Bell size={15} /> <span className="hidden sm:inline">Notifications</span>
          </Link>
          <button
            type="button"
            onClick={() => void load(status, search, offset)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={15} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* Tiles are counts over the engine's own table, not a second ledger. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => setStatus(tile.filter)}
            className={`rounded-2xl border bg-white p-4 text-left transition hover:border-slate-300 ${
              status === tile.filter ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              {tile.icon} {tile.label}
            </span>
            <span className="mt-2 block text-2xl font-black tabular-nums text-slate-950">{tile.value}</span>
          </button>
        ))}
        <div className="rounded-2xl border border-slate-900 bg-slate-950 p-4 text-white">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
            <TrendingUp size={16} /> Today
          </span>
          <span className="mt-2 block text-2xl font-black tabular-nums">{money(summary?.todayValue ?? 0)}</span>
          <span className="mt-0.5 block text-[11px] font-bold text-white/50">
            {summary?.todayCount ?? 0} order{(summary?.todayCount ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <Search size={16} className="shrink-0 text-slate-400" />
          <span className="sr-only">Search orders</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer…"
            className="h-full w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
              className={`h-11 rounded-xl px-4 text-xs font-black uppercase tracking-[0.1em] transition ${
                status === f ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-400">Loading orders…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Inbox size={26} className="mx-auto text-slate-300" />
          <p className="mt-3 text-base font-black text-slate-900">No orders here yet</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Customer orders placed through VYRON ORDER arrive here the moment they are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.orderId}
              href={`/order-centre/${row.orderId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-slate-950">{row.orderNumber}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${STAFF_STATUS_TONE[row.status] || "border-slate-200 bg-slate-100 text-slate-700"}`}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-slate-700">{row.customerName}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {row.lineCount} product{row.lineCount === 1 ? "" : "s"} · for {formatDate(row.requestedDeliveryDate)} · {formatTime(row.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-base font-black tabular-nums text-slate-950">{money(row.total)}</span>
                <ChevronRight size={17} className="text-slate-400" />
              </div>
            </Link>
          ))}

          {total > PAGE ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs font-bold text-slate-500">
                {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => { const next = Math.max(0, offset - PAGE); setOffset(next); void load(status, search, next); }}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE >= total}
                  onClick={() => { const next = offset + PAGE; setOffset(next); void load(status, search, next); }}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
