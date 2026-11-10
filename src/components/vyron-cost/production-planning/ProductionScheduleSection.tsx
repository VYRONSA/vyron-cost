"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Run = {
  id: string;
  run_number: string;
  production_date: string;
  status: string;
  required_date: string | null;
  planned_qty_total: number;
  produced_qty_total: number;
  products: Array<{ product_id: string; product_name: string; planned_qty: number }>;
  next_statuses: string[];
};

const STATUSES = ["All", "Draft", "Planned", "Released", "Completed", "Cancelled"];
const qty = (v: number) => Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 3 });
const TONE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Planned: "bg-sky-100 text-sky-800",
  Released: "bg-amber-100 text-amber-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-rose-100 text-rose-700",
};

async function fetchRuns(status: string, from: string, to: string): Promise<{ runs: Run[]; error: string | null }> {
  const qs = new URLSearchParams();
  if (status !== "All") qs.set("status", status);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const data = await fetch(`/api/store-production-runs?${qs}`, { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ ok: false }));
  return data.ok ? { runs: data.runs || [], error: null } : { runs: [], error: data.error || "Production schedule could not be loaded." };
}

/**
 * Production schedule: store production runs by planned production date, with the earliest
 * required date of their store orders, planned quantity, finished goods, and status tracking.
 * Raw-material requirements (from the BOM) are on each run's page.
 */
export default function ProductionScheduleSection({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // South African calendar day, fixed when the section mounts.
  const [today] = useState(() => new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    void fetchRuns(status, from, to).then((r) => {
      if (cancelled) return;
      setRuns(r.runs);
      setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [status, from, to, version]);

  const patch = async (run: Run, body: Record<string, string>) => {
    setBusy(run.id);
    setError(null);
    try {
      const res = await fetch(`/api/store-production-runs/${run.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Update failed.");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  };


  return (
    <section className="rounded-[2rem] border border-[#E2E8F0] bg-white p-5" data-testid="production-schedule">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#0B202B]">Production Schedule</h2>
          <p className="text-xs font-semibold text-[#64748B]">Runs by planned production date. Late = planned after the earliest required date. Completing a run posts stock on the run page.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-[#334155]">
            Planned from
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-bold text-[#334155]">
            to
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-bold text-[#334155]">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</div> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
              <th className="px-2 py-2">Run</th>
              <th className="px-2 py-2">Planned date</th>
              <th className="px-2 py-2">Required by</th>
              <th className="px-2 py-2">Finished goods</th>
              <th className="px-2 py-2 text-right">Planned qty</th>
              <th className="px-2 py-2 text-right">Produced</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {runs === null ? (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-[#64748B]">Loading…</td></tr>
            ) : runs.length === 0 ? (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-[#64748B]">No production runs match.</td></tr>
            ) : (
              runs.map((run) => {
                const late = Boolean(run.required_date && run.production_date > run.required_date && !["Completed", "Cancelled"].includes(run.status));
                const overdue = run.production_date < today && !["Completed", "Cancelled"].includes(run.status);
                return (
                  <tr key={run.id} className="border-t border-[#F1F5F9] align-top">
                    <td className="px-2 py-2"><Link href={`/production-runs/${run.id}`} className="font-bold text-[#1F4757] hover:underline">{run.run_number}</Link></td>
                    <td className="px-2 py-2">
                      {canEdit && ["Draft", "Planned"].includes(run.status) ? (
                        <input type="date" defaultValue={run.production_date} disabled={busy === run.id} onBlur={(e) => { if (e.target.value && e.target.value !== run.production_date) void patch(run, { production_date: e.target.value }); }} className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm" />
                      ) : (
                        run.production_date
                      )}
                      {overdue ? <span className="ml-1 text-[10px] font-black uppercase text-rose-700">overdue</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      {run.required_date || <span className="text-[#94A3B8]">not stated</span>}
                      {late ? <span className="ml-1 text-[10px] font-black uppercase text-rose-700">late</span> : null}
                    </td>
                    <td className="px-2 py-2 text-xs">{run.products.map((p) => `${p.product_name} (${qty(p.planned_qty)})`).join(" · ") || "—"}</td>
                    <td className="px-2 py-2 text-right font-bold">{qty(run.planned_qty_total)}</td>
                    <td className="px-2 py-2 text-right">{qty(run.produced_qty_total)}</td>
                    <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${TONE[run.status] || "bg-slate-100"}`}>{run.status}</span></td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {canEdit
                        ? run.next_statuses.map((s) => (
                            <button key={s} type="button" disabled={busy === run.id} onClick={() => void patch(run, { status: s })} className="mr-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px] font-bold text-[#334155] disabled:opacity-50">
                              {s === "Cancelled" ? "Cancel" : `Mark ${s}`}
                            </button>
                          ))
                        : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
