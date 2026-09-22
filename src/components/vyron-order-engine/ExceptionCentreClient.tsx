"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Notice, NotEnabledNotice, OrderEngineTabs, Pill, SeverityPill, SOURCE_LABEL, when } from "@/components/vyron-order-engine/ui";

type OpenRow = {
  intakeId: string;
  intakeNumber: string;
  intakeStatus: string;
  customerName: string | null;
  source: string;
  receivedAt: string;
  lineNo: number | null;
  code: string;
  severity: "error" | "warning";
  blocking: boolean;
  category: string;
  title: string;
  message: string;
  action: string;
  originalValue?: string | null;
  expectedValue?: string | null;
  raisedAt?: string | null;
  raisedBy?: string | null;
};

type DocumentRow = {
  messageId: string;
  channel: string;
  receivedAt: string;
  from: string | null;
  subject: string | null;
  code: string;
  severity: "error" | "warning";
  documents: string[];
  reason: string | null;
  action: string;
};

type ResolvedRow = {
  intakeId: string;
  intakeNumber: string | null;
  type: "LINE_RESOLVED" | "CUSTOMER_RESOLVED";
  detail: string | null;
  resolvedBy: string;
  resolvedByName: string | null;
  resolvedAt: string;
  remembered: boolean;
};

type Loaded = { kind: "ok"; open: OpenRow[]; resolved: ResolvedRow[]; documents: DocumentRow[] } | { kind: "not_enabled" } | { kind: "error"; error: string };

async function fetchCentre(): Promise<Loaded> {
  try {
    const res = await fetch("/api/order-intake/exceptions", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.code === "NOT_ENABLED") return { kind: "not_enabled" };
    if (!res.ok || !data.ok) return { kind: "error", error: data.error || "Could not load exceptions." };
    return { kind: "ok", open: data.open || [], resolved: data.resolved || [], documents: data.documents || [] };
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "Could not load exceptions." };
  }
}

export default function ExceptionCentreClient() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [only, setOnly] = useState<"all" | "blocking" | "warnings">("all");

  useEffect(() => {
    let cancelled = false;
    fetchCentre().then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (loaded?.kind !== "ok") return [];
    return loaded.open.filter((r) => only === "all" || (only === "blocking" ? r.blocking : !r.blocking));
  }, [loaded, only]);

  const byCode = useMemo(() => {
    const counts = new Map<string, { title: string; blocking: boolean; count: number }>();
    if (loaded?.kind === "ok") {
      for (const r of loaded.open) {
        const current = counts.get(r.code) || { title: r.title, blocking: r.blocking, count: 0 };
        current.count++;
        counts.set(r.code, current);
      }
    }
    return [...counts.entries()].sort((a, b) => Number(b[1].blocking) - Number(a[1].blocking) || b[1].count - a[1].count);
  }, [loaded]);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Exception Centre</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
          Everything that stops or needs a decision on an order — what went wrong, why, where, and what to do. Blocking issues must be resolved before
          approval; warnings are acknowledged by the approver.
        </p>
      </div>
      <OrderEngineTabs active="exceptions" />

      {loaded === null ? <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading…</div> : null}
      {loaded?.kind === "not_enabled" ? <NotEnabledNotice /> : null}
      {loaded?.kind === "error" ? <Notice tone="error">{loaded.error}</Notice> : null}

      {loaded?.kind === "ok" ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {byCode.slice(0, 8).map(([code, info]) => (
              <div key={code} className="rounded-2xl bg-white p-4 shadow-[0_12px_34px_rgba(11,32,43,0.08)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">{info.title}</span>
                  <SeverityPill severity={info.blocking ? "error" : "warning"} />
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">{info.count}</div>
              </div>
            ))}
            {byCode.length === 0 ? <Notice tone="success">No open exceptions.</Notice> : null}
          </section>

          <Card
            title={`Open (${rows.length})`}
            actions={
              <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
                {(["all", "blocking", "warnings"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOnly(key)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-black ${only === key ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                  >
                    {key === "all" ? "All" : key === "blocking" ? "Blocking" : "Warnings"}
                  </button>
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-[0.8fr_1fr_1.1fr_0.4fr_1.4fr_1.1fr_1.6fr_0.9fr] gap-3 border-b border-slate-100 pb-2 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">
                  <div>Severity</div>
                  <div>Order</div>
                  <div>Customer</div>
                  <div>Line</div>
                  <div>What went wrong</div>
                  <div>Values</div>
                  <div>What to do</div>
                  <div>Raised</div>
                </div>
                {rows.map((row, index) => (
                  <Link
                    key={`${row.intakeId}-${row.code}-${row.lineNo}-${index}`}
                    href={`/order-inbox/${row.intakeId}`}
                    className="grid grid-cols-[0.8fr_1fr_1.1fr_0.4fr_1.4fr_1.1fr_1.6fr_0.9fr] items-start gap-3 border-b border-slate-50 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <div>
                      <SeverityPill severity={row.severity} />
                    </div>
                    <div>
                      <div className="font-black text-slate-900">{row.intakeNumber}</div>
                      <div className="text-xs text-slate-400">
                        {SOURCE_LABEL[row.source] || row.source} · {when(row.receivedAt)}
                      </div>
                    </div>
                    <div className="truncate">{row.customerName || <span className="text-slate-400">Not stated</span>}</div>
                    <div>{row.lineNo ?? "—"}</div>
                    <div>
                      <div className="font-black text-slate-900">{row.title}</div>
                      <div className="text-xs text-slate-500">{row.message}</div>
                    </div>
                    <div className="text-xs text-slate-600">
                      {row.originalValue ? (
                        <div>
                          <span className="text-slate-400">Order: </span>
                          {row.originalValue}
                        </div>
                      ) : null}
                      {row.expectedValue ? (
                        <div>
                          <span className="text-slate-400">Expected: </span>
                          {row.expectedValue}
                        </div>
                      ) : null}
                      {!row.originalValue && !row.expectedValue ? <span className="text-slate-400">—</span> : null}
                    </div>
                    <div className="text-xs text-slate-600">{row.action}</div>
                    <div className="text-xs text-slate-500">
                      <div>{row.raisedBy || "—"}</div>
                      <div>{row.raisedAt ? when(row.raisedAt) : ""}</div>
                    </div>
                  </Link>
                ))}
                {rows.length === 0 ? <div className="py-8 text-center text-sm font-semibold text-slate-400">Nothing here.</div> : null}
              </div>
            </div>
          </Card>

          <Card title={`Documents not turned into orders (${loaded.documents.length})`}>
            {loaded.documents.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">Every received document became an order.</p>
            ) : (
              <div className="grid gap-2">
                {loaded.documents.map((d) => (
                  <div key={d.messageId} className="grid grid-cols-[0.7fr_1.4fr_1.6fr_1.8fr] items-start gap-3 rounded-xl border border-slate-50 p-2 text-sm font-semibold text-slate-700">
                    <SeverityPill severity={d.severity} />
                    <div>
                      <div className="font-black text-slate-900">{d.subject || "(no subject)"}</div>
                      <div className="text-xs text-slate-400">
                        {d.from || "unknown sender"} · {when(d.receivedAt)}
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="text-slate-900">{d.documents.join(", ") || "No attachment"}</div>
                      <div className="text-slate-500">{d.reason}</div>
                    </div>
                    <div className="text-xs text-slate-600">{d.action}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recently resolved">
            {loaded.resolved.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">No exceptions resolved yet.</p>
            ) : (
              <div className="grid gap-2">
                {loaded.resolved.map((r, index) => (
                  <Link key={`${r.intakeId}-${index}`} href={`/order-inbox/${r.intakeId}`} className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-3 rounded-xl border border-slate-50 p-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <span className="font-black text-slate-900">{r.intakeNumber || "—"}</span>
                    <span>
                      {r.detail}
                      {r.remembered ? (
                        <span className="ml-2">
                          <Pill tone="blue">remembered</Pill>
                        </span>
                      ) : null}
                    </span>
                    <span>{r.resolvedByName || r.resolvedBy}</span>
                    <span className="text-xs text-slate-500">{when(r.resolvedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
