"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, UploadCloud } from "lucide-react";
import { formatCurrency } from "@/lib/vyron-cost/stock-engine";
import { readXeroQueueLocally } from "@/lib/vyron-cost/customer-invoice-flow";
import type { XeroSyncStatus } from "@/lib/vyron-xero-integration";

type QueueRow = {
  id: string;
  type: string;
  reference: string;
  counterparty: string;
  status: XeroSyncStatus;
  xeroId?: string;
  lastAttempt: string;
  destination: string;
  value: number;
  note: string;
};

const DEMO_QUEUE: QueueRow[] = [
  {
    id: "demo-1",
    type: "Customer",
    reference: "CUST-001",
    counterparty: "Local Café Group",
    status: "Ready",
    lastAttempt: new Date().toISOString(),
    destination: "Xero Contact",
    value: 0,
    note: "Ready to sync as Xero contact.",
  },
  {
    id: "demo-2",
    type: "Supplier Bill",
    reference: "BILL-1044",
    counterparty: "Cape Premium Meats",
    status: "Needs Review",
    lastAttempt: new Date().toISOString(),
    destination: "Xero Bill",
    value: 18250,
    note: "Supplier VAT number missing before sync.",
  },
];

export default function XeroSyncCentreClient() {
  const [rows, setRows] = useState<QueueRow[]>(DEMO_QUEUE);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/integrations/xero/sync-queue")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) {
          setRows(d.items.length ? d.items : DEMO_QUEUE);
        } else {
          const local = readXeroQueueLocally().map((item) => ({
            id: item.id,
            type: "Customer Invoice",
            reference: item.reference,
            counterparty: item.name,
            status: item.status,
            xeroId: undefined,
            lastAttempt: new Date().toISOString(),
            destination: item.destination,
            value: item.value,
            note: item.note,
          }));
          setRows(local.length ? local : DEMO_QUEUE);
        }
      })
      .catch(() => {
        const local = readXeroQueueLocally();
        if (local.length) {
          setRows(
            local.map((item) => ({
              id: item.id,
              type: "Customer Invoice",
              reference: item.reference,
              counterparty: item.name,
              status: item.status,
              lastAttempt: new Date().toISOString(),
              destination: item.destination,
              value: item.value,
              note: item.note,
            }))
          );
        }
      });

    fetch("/api/integrations/xero/connection")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setConnected(Boolean(d.connection?.connected));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    return {
      ready: rows.filter((r) => r.status === "Ready").length,
      synced: rows.filter((r) => r.status === "Synced").length,
      failed: rows.filter((r) => r.status === "Failed").length,
      review: rows.filter((r) => r.status === "Needs Review").length,
    };
  }, [rows]);

  async function syncRow(id: string) {
    if (!connected) {
      setMessage("Connect Xero on the Setup page before syncing.");
      return;
    }
    const res = await fetch("/api/integrations/xero/sync-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "Sync failed.");
      return;
    }
    setMessage(`Synced ${data.item?.reference || id} to Xero.`);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Ready" value={String(summary.ready)} />
        <Metric title="Synced" value={String(summary.synced)} tone="good" />
        <Metric title="Failed" value={String(summary.failed)} tone="bad" />
        <Metric title="Needs Review" value={String(summary.review)} tone="warn" />
      </div>

      {message ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900">{message}</div>
      ) : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Xero Sync Queue</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Approved VYRON COST transactions waiting for Xero ledger posting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-xs font-black text-violet-800"
            >
              <RefreshCcw size={14} />
              Refresh
            </button>
            <Link href="/integrations/xero/setup" className="rounded-2xl bg-violet-700 px-4 py-2 text-xs font-black text-white">
              Xero Setup
            </Link>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1100px]">
            <div className="grid grid-cols-8 gap-3 bg-slate-950 px-5 py-4 text-[11px] font-black uppercase tracking-[0.12em] text-white">
              <div>Type</div>
              <div>Reference</div>
              <div className="col-span-2">Customer / Supplier / Product</div>
              <div>Status</div>
              <div>Xero ID</div>
              <div>Last Attempt</div>
              <div>Action</div>
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-8 items-center gap-3 border-t border-slate-100 px-5 py-4 text-sm">
                <div className="font-black text-violet-700">{row.type}</div>
                <div className="font-bold text-slate-700">{row.reference}</div>
                <div className="col-span-2 font-semibold text-slate-800">{row.counterparty}</div>
                <div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="text-xs font-bold text-slate-500">{row.xeroId || "—"}</div>
                <div className="text-xs font-semibold text-slate-500">{formatAttempt(row.lastAttempt)}</div>
                <div className="flex flex-wrap gap-2">
                  {row.status === "Ready" ? (
                    <button
                      type="button"
                      onClick={() => void syncRow(row.id)}
                      className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-black text-white"
                    >
                      <UploadCloud size={14} />
                      Sync
                    </button>
                  ) : null}
                  {row.status === "Needs Review" ? (
                    <Link href="/integrations/xero/setup" className="rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900">
                      Review
                    </Link>
                  ) : null}
                </div>
                <div className="col-span-8 rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  {row.destination} · {row.value ? formatCurrency(row.value) : "—"} · {row.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, tone = "default" }: { title: string; value: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-rose-700" : "text-slate-950";
  return (
    <div className="rounded-[1.75rem] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{title}</div>
      <div className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: XeroSyncStatus }) {
  const classes: Record<XeroSyncStatus, string> = {
    Ready: "bg-violet-100 text-violet-800",
    Synced: "bg-emerald-100 text-emerald-800",
    Failed: "bg-rose-100 text-rose-800",
    "Needs Review": "bg-amber-100 text-amber-800",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes[status]}`}>{status}</span>;
}

function formatAttempt(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
