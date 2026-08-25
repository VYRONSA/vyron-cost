"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, ChevronRight, Inbox, ClipboardCheck, Factory, PackageCheck,
  Receipt, TrendingUp, Bell, RefreshCw,
} from "lucide-react";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";
import type { OrderCentreSummary, OrderCentreRow } from "@/lib/vyron-order-centre";

const M = VYRON_MASTER;

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
  Draft: "vyron-status vyron-status-info",
  "Awaiting Approval": "vyron-status vyron-status-warning",
  Approved: "vyron-status vyron-status-info",
  Picking: "vyron-status vyron-status-info",
  Packed: "vyron-status vyron-status-info",
  Dispatched: "vyron-status vyron-status-success",
  "Partially Invoiced": "vyron-status vyron-status-success",
  Invoiced: "vyron-status vyron-status-neutral",
  Cancelled: "vyron-status vyron-status-error",
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
      {/* The module header VYRON COST uses everywhere else, with this module's own content. */}
      <header className={`${M.moduleHeaderNavy} p-4 lg:p-7`}>
        <div className={`relative p-1 md:p-2 ${M.dashboardHeroInner}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/*
                The mobile shell already names the page above this panel, so on a
                phone the header keeps only what the shell does not say — the
                live figures. Repeating the title three times down the screen
                was noise, not branding.
              */}
              <div className="mb-2 hidden items-center gap-2 rounded-full border border-[#3B82F6]/35 bg-[#3B82F6]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#BFDBFE] lg:inline-flex">
                VYRON ORDER
              </div>
              {/*
                The heading stays in the document on every screen — a page
                without one is a page a screen reader cannot announce. On a
                phone it is only hidden from sight, because the shell above
                already shows the same words.
              */}
              <h1 className={`sr-only lg:not-sr-only lg:text-4xl lg:tracking-tight ${M.headingOnDark}`}>Order Centre</h1>
              <p className={`mt-2 hidden max-w-3xl text-sm font-medium leading-6 lg:block ${M.bodyOnDark}`}>
                Customer orders, live from the VYRON COST sales-order engine.
              </p>
              <div className="flex flex-wrap gap-3 text-xs font-semibold lg:mt-4">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Today: <span className="text-white tabular-nums">{money(summary?.todayValue ?? 0)}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Orders today:{" "}
                  <span className="text-white tabular-nums">{summary?.todayCount ?? 0}</span>
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[#CBD5E1]">
                  Showing: <span className="text-white tabular-nums">{total}</span>
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/order-centre/notifications"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-bold uppercase tracking-[0.1em] text-white backdrop-blur transition hover:border-white/35 hover:bg-white/20"
              >
                <Bell size={15} /> <span className="hidden sm:inline">Notifications</span>
              </Link>
              <button
                type="button"
                onClick={() => void load(status, search, offset)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-bold uppercase tracking-[0.1em] text-white backdrop-blur transition hover:border-white/35 hover:bg-white/20"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />{" "}
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tiles are counts over the engine's own table, not a second ledger. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => {
          const selected = status === tile.filter;
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setStatus(tile.filter)}
              className={`${M.dashboardWidget} text-left ${
                selected ? "border-[#1D6BFF]/40 ring-1 ring-[#2563EB]/25" : ""
              }`}
            >
              <span className={`flex items-center gap-1.5 ${M.label}`}>
                <span className={`${M.iconSubtle} h-6 w-6`}>{tile.icon}</span> {tile.label}
              </span>
              <span className={`mt-2 block text-2xl tabular-nums ${selected ? M.accentKpiGradient : "font-black text-[#0F172A]"}`}>
                {tile.value}
              </span>
            </button>
          );
        })}
        <div className={`${M.dashboardWidget} border-[#1D6BFF]/25`}>
          <span className={`flex items-center gap-1.5 ${M.label}`}>
            <span className={`${M.iconEmphasis} h-6 w-6`}><TrendingUp size={14} /></span> Today
          </span>
          <span className={`mt-2 block text-2xl tabular-nums ${M.accentKpiGradient}`}>{money(summary?.todayValue ?? 0)}</span>
          <span className="mt-0.5 block text-[11px] font-semibold text-[#64748B]">
            {summary?.todayCount ?? 0} order{(summary?.todayCount ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className={`${M.filterBar} mb-0 flex flex-wrap items-center gap-3`}>
        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/85 px-3 transition focus-within:border-[#4F46E5] focus-within:ring-4 focus-within:ring-[#4F46E5]/12">
          <Search size={16} className="shrink-0 text-[#94A3B8]" />
          <span className="sr-only">Search orders</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer…"
            className={`h-full w-full bg-transparent text-sm font-semibold text-[#0F172A] outline-none ${M.inputPlaceholder}`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
              className={
                status === f
                  ? `${M.primaryBtn} h-11 px-4 text-xs uppercase tracking-[0.1em]`
                  : `${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em]`
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className={`${M.alertError} px-4 py-3 text-sm font-bold`}>{error}</p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className={M.tableEmptyLight}>Loading orders…</p>
      ) : rows.length === 0 ? (
        <div className={M.moduleEmptyState}>
          <Inbox size={26} className="mx-auto text-[#CBD5E1]" />
          <p className="mt-3 text-base font-black text-[#0F172A]">No orders here yet</p>
          <p className="mt-1 text-sm font-semibold text-[#64748B]">
            Customer orders placed through VYRON ORDER arrive here the moment they are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.orderId}
              href={`/order-centre/${row.orderId}`}
              className={`${M.lightCard} ${M.lightCardHover} flex flex-wrap items-center justify-between gap-3 px-4 py-4`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-[#0F172A]">{row.orderNumber}</span>
                  <span className={STAFF_STATUS_TONE[row.status] || "vyron-status vyron-status-neutral"}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-[#334155]">{row.customerName}</p>
                <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                  {row.lineCount} product{row.lineCount === 1 ? "" : "s"} · for {formatDate(row.requestedDeliveryDate)} · {formatTime(row.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-base font-black tabular-nums text-[#0F172A]">{money(row.total)}</span>
                <ChevronRight size={17} className="text-[#94A3B8]" />
              </div>
            </Link>
          ))}

          {total > PAGE ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs font-bold text-[#64748B] tabular-nums">
                {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => { const next = Math.max(0, offset - PAGE); setOffset(next); void load(status, search, next); }}
                  className={`${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-40`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE >= total}
                  onClick={() => { const next = offset + PAGE; setOffset(next); void load(status, search, next); }}
                  className={`${M.secondaryBtn} h-11 px-4 text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-40`}
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
