"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileUp, Plus, RefreshCw } from "lucide-react";
import type { IntakeStatus } from "@/lib/order-engine/types";
import { Card, IntakeStatusPill, KpiCard, Notice, NotEnabledNotice, Pill, SecondaryButton, when } from "@/components/vyron-order-engine/ui";

type View = "inbox" | "approvals" | "exceptions" | "done" | "all";

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

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "inbox", label: "Inbox" },
  { key: "approvals", label: "Approvals" },
  { key: "exceptions", label: "Exceptions" },
  { key: "done", label: "Completed" },
  { key: "all", label: "All" },
];

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  csv: "CSV",
  xlsx: "Excel",
  email: "E-mail",
  pdf: "PDF",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
  api: "API",
  edi: "EDI",
};

/** Pure fetch: returns the result, sets no state. */
async function fetchIntakeList(target: View): Promise<{ rows: Row[]; counts: Record<IntakeStatus, number> | null; notEnabled: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/order-intake?view=${target}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return { rows: [], counts: null, notEnabled: true, error: null };
    if (!res.ok || !data.ok) return { rows: [], counts: null, notEnabled: false, error: data.error || "Could not load orders." };
    return { rows: data.rows || [], counts: data.counts || null, notEnabled: false, error: null };
  } catch (e) {
    return { rows: [], counts: null, notEnabled: false, error: e instanceof Error ? e.message : "Could not load orders." };
  }
}

export default function OrderInboxClient({ initialView, canCreate }: { initialView: View; canCreate: boolean }) {
  const [view, setView] = useState<View>(initialView);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<IntakeStatus, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  type ListResult = { rows: Row[]; counts: Record<IntakeStatus, number> | null; notEnabled: boolean; error: string | null };

  const applyResult = useCallback((result: ListResult) => {
    setRows(result.rows);
    if (result.counts) setCounts(result.counts);
    setNotEnabled(result.notEnabled);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchIntakeList(view).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult, view]);

  const load = (target: View) => fetchIntakeList(target).then(applyResult);

  const changeView = (next: View) => {
    if (next === view) return;
    setLoading(true);
    setView(next);
  };

  const refresh = () => {
    setLoading(true);
    void load(view);
  };

  const count = (...statuses: IntakeStatus[]) => (counts ? statuses.reduce((sum, s) => sum + (counts[s] || 0), 0) : 0);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Order Inbox</h1>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
            Orders received from customers are checked here — customer, products, prices, stock and margin — and approved before they become sales
            orders. Nothing is reserved, invoiced or posted from this screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={refresh} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </SecondaryButton>
          {canCreate && !notEnabled ? (
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

      {notEnabled ? <NotEnabledNotice /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {!notEnabled ? (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Needs review" value={String(count("RECEIVED"))} active={view === "inbox"} onClick={() => changeView("inbox")} />
          <KpiCard label="Exceptions" value={String(count("EXCEPTION"))} active={view === "exceptions"} onClick={() => changeView("exceptions")} />
          <KpiCard label="Awaiting approval" value={String(count("AWAITING_APPROVAL", "ON_HOLD"))} active={view === "approvals"} onClick={() => changeView("approvals")} />
          <KpiCard label="Confirmed" value={String(count("CONFIRMED"))} active={view === "done"} onClick={() => changeView("done")} />
        </section>
      ) : null}

      {!notEnabled ? (
        <Card
          actions={
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
          }
          title="Orders"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[1.1fr_1.6fr_1fr_0.8fr_0.6fr_1.1fr_1fr] gap-3 border-b border-slate-100 pb-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                <div>Order</div>
                <div>Customer</div>
                <div>PO / reference</div>
                <div>Source</div>
                <div>Lines</div>
                <div>Status</div>
                <div>Received</div>
              </div>
              {loading ? <div className="py-8 text-center text-sm font-semibold text-slate-400">Loading…</div> : null}
              {!loading && rows.length === 0 ? (
                <div className="py-10 text-center text-sm font-semibold text-slate-400">No orders in this view.</div>
              ) : null}
              {!loading &&
                rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/order-inbox/${row.id}`}
                    className="grid grid-cols-[1.1fr_1.6fr_1fr_0.8fr_0.6fr_1.1fr_1fr] items-center gap-3 border-b border-slate-50 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
        </Card>
      ) : null}
    </div>
  );
}
