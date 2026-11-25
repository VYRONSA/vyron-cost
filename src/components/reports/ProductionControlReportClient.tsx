"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReportDocument, { ReportTable } from "@/components/reports/ReportDocument";
import type { ProductionControlReport, ProductionJob } from "@/lib/vyron-production-control";
import {
  exportProductionControlCsv,
  exportProductionControlExcel,
  exportProductionControlPdf,
} from "@/lib/vyron-production-control-export";

const fmt = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { maximumFractionDigits: dp });
const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "Not available" : `R${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "Not available" : `${n.toFixed(1)}%`);

const STATUS_TONE: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  "In Production": "bg-blue-50 text-blue-700",
  Completed: "bg-emerald-50 text-emerald-700",
  "On Hold": "bg-rose-50 text-rose-700",
  Cancelled: "bg-slate-100 text-slate-400 line-through",
  Reversed: "bg-amber-50 text-amber-800",
};

const control =
  "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

/**
 * Daily Production Control Report — screen. Every figure comes from the server
 * report; this component only filters what is shown and exports it.
 */
export default function ProductionControlReportClient({
  report,
  companyName,
  generatedAt,
  loadError,
  mode,
}: {
  report: ProductionControlReport | null;
  companyName: string;
  generatedAt: string;
  loadError: string | null;
  mode: "day" | "range";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const go = useCallback(
    (params: Record<string, string>) => {
      setPending(true);
      router.replace(`/reports/production-control?${new URLSearchParams(params).toString()}`);
      window.setTimeout(() => setPending(false), 900);
    },
    [router]
  );

  const r = report;
  const view = r?.view ?? "daily";
  const exceptionJobs = useMemo(() => new Set((r?.exceptions ?? []).map((e) => e.jobNumber)), [r]);
  const jobs = useMemo(() => (r?.jobs ?? []).filter((j) => !exceptionsOnly || exceptionJobs.has(j.jobNumber)), [r, exceptionsOnly, exceptionJobs]);

  const summary = r
    ? [
        { label: "Jobs Scheduled", value: String(r.kpis.jobsScheduled) },
        { label: "Jobs Completed", value: String(r.kpis.jobsCompleted) },
        { label: "Jobs In Progress", value: String(r.kpis.jobsInProgress) },
        { label: "Jobs Overdue", value: String(r.kpis.jobsOverdue) },
        { label: "Jobs On Hold", value: String(r.kpis.jobsOnHold) },
        { label: "Material Shortages (jobs)", value: String(r.kpis.materialShortageJobs) },
        { label: "Planned Units", value: fmt(r.kpis.plannedUnits) },
        { label: "Actual Units", value: fmt(r.kpis.actualUnits) },
        { label: "Production Achievement", value: pct(r.kpis.achievementPct) },
        { label: "Outstanding Production Value", value: money(r.kpis.outstandingValue) },
      ]
    : [];

  const runExport = (kind: "pdf" | "excel" | "csv") => {
    if (!r) return;
    setExportError(null);
    try {
      if (kind === "pdf") exportProductionControlPdf(r, companyName, generatedAt);
      else if (kind === "excel") exportProductionControlExcel(r, companyName);
      else exportProductionControlCsv(r, companyName);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  const filters = r
    ? [
        { key: "period", label: mode === "day" ? "Production Date" : "Date Range", value: r.from === r.to ? r.from : `${r.from} to ${r.to}` },
        { key: "view", label: "View", value: view === "daily" ? "Daily" : view === "weekly" ? "Weekly summary" : "Monthly summary" },
      ]
    : [];

  return (
    <ReportDocument
      reportKey="production-control"
      title="Daily Production Control Report"
      subtitle="Schedule, plan attainment, material readiness and exceptions for the production meeting."
      companyName={companyName}
      period={{ kind: "range", from: r?.from ?? null, to: r?.to ?? null }}
      generatedAt={generatedAt}
      filters={filters}
      onRefresh={() => r && go({ mode, from: r.from, to: r.to, view })}
      refreshing={pending}
      error={loadError}
      isEmpty={false}
      summary={summary}
      controls={
        <>
          <label className="min-w-[140px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Period</span>
            <select
              value={mode}
              onChange={(e) =>
                r && go(e.target.value === "day" ? { mode: "day", date: r.to, view: "daily" } : { mode: "range", from: r.from, to: r.to, view })
              }
              className={control}
            >
              <option value="day">Single production date</option>
              <option value="range">Date range</option>
            </select>
          </label>
          {mode === "day" ? (
            <label className="min-w-[160px]">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Production Date</span>
              <input type="date" defaultValue={r?.from} onChange={(e) => e.target.value && go({ mode: "day", date: e.target.value, view: "daily" })} className={control} />
            </label>
          ) : (
            <>
              <label className="min-w-[150px]">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">From</span>
                <input type="date" defaultValue={r?.from} onChange={(e) => r && e.target.value && go({ mode: "range", from: e.target.value, to: r.to, view })} className={control} />
              </label>
              <label className="min-w-[150px]">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">To</span>
                <input type="date" defaultValue={r?.to} onChange={(e) => r && e.target.value && go({ mode: "range", from: r.from, to: e.target.value, view })} className={control} />
              </label>
              <label className="min-w-[160px]">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Summary</span>
                <select value={view} onChange={(e) => r && go({ mode: "range", from: r.from, to: r.to, view: e.target.value })} className={control}>
                  <option value="daily">Daily view</option>
                  <option value="weekly">Weekly summary</option>
                  <option value="monthly">Monthly summary</option>
                </select>
              </label>
            </>
          )}
          <span className="flex flex-wrap gap-2 pb-1">
            {(["pdf", "excel", "csv"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={!r}
                onClick={() => runExport(k)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 disabled:opacity-40"
              >
                {k === "pdf" ? "Download PDF" : k === "excel" ? "Export Excel" : "Export CSV"}
              </button>
            ))}
          </span>
          {exportError ? <span className="text-xs font-bold text-rose-700">{exportError}</span> : null}
        </>
      }
    >
      {r ? (
        <div className="space-y-6">
          {r.dataNotes.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold leading-relaxed text-amber-900">
              <div className="text-[10px] font-black uppercase tracking-[0.14em]">Data notes</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {r.dataNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Section title={`Exceptions (${r.exceptions.length})`}>
            {r.exceptions.length ? (
              <ReportTable minWidth={1100}>
                <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-2">Exception</th>
                    <th className="px-3 py-2">Job</th>
                    <th className="px-3 py-2">Finished Good</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Recommended Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {r.exceptions.map((e, i) => (
                    <tr key={`${e.jobNumber}-${e.type}-${i}`} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap font-black text-rose-700">{e.type}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-900">{e.jobNumber}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{e.product}</td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-slate-700">{e.reason}</td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-emerald-800">{e.action}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            ) : (
              <Empty text="No exceptions for this period." />
            )}
          </Section>

          <Section
            title={`Production schedule (${r.jobs.length} job${r.jobs.length === 1 ? "" : "s"}${r.kpis.jobsCarriedForward ? `, ${r.kpis.jobsCarriedForward} carried forward` : ""})`}
            right={
              <label className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-600 print:hidden">
                <input type="checkbox" checked={exceptionsOnly} onChange={(e) => setExceptionsOnly(e.target.checked)} />
                Jobs with exceptions only
              </label>
            }
          >
            {jobs.length ? (
              <ReportTable minWidth={1500}>
                <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-2">Job</th>
                    <th className="px-3 py-2">Finished Good</th>
                    <th className="px-3 py-2">Item Code</th>
                    <th className="px-3 py-2">Planned Date</th>
                    <th className="px-3 py-2">Required</th>
                    <th className="px-3 py-2 text-right">Planned</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Area</th>
                    <th className="px-3 py-2">Responsible</th>
                    <th className="px-3 py-2">Materials</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <JobRow
                      key={j.id}
                      job={j}
                      open={expanded.has(j.id)}
                      flagged={exceptionJobs.has(j.jobNumber)}
                      onToggle={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(j.id)) next.delete(j.id);
                          else next.add(j.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </tbody>
              </ReportTable>
            ) : (
              <Empty text="No production runs are scheduled in this period." />
            )}
          </Section>

          <Section title="Planned versus actual by finished good">
            {r.products.length ? (
              <ReportTable minWidth={1000}>
                <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-2">Finished Good</th>
                    <th className="px-3 py-2">Item Code</th>
                    <th className="px-3 py-2 text-right">Jobs</th>
                    <th className="px-3 py-2 text-right">Planned</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Variance</th>
                    <th className="px-3 py-2 text-right">% of Target</th>
                    <th className="px-3 py-2 text-right">Carry-forward</th>
                  </tr>
                </thead>
                <tbody>
                  {r.products.map((p) => (
                    <tr key={`${p.product}-${p.itemCode}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold text-slate-900">{p.product}</td>
                      <td className="px-3 py-2 text-slate-600">{p.itemCode ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.jobs}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(p.plannedQty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(p.actualQty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(p.remainingQty)}</td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${p.variance < 0 ? "text-rose-700" : "text-slate-900"}`}>{fmt(p.variance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(p.achievementPct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(p.carryForwardQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            ) : (
              <Empty text="Nothing planned in this period." />
            )}
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              Planned is the quantity on the run when it was issued; completing a run never changes it. Actual counts only completed runs —
              a run still in production has no recorded output.
            </p>
          </Section>

          <Section title="Material readiness">
            {r.shortages.length ? (
              <ReportTable minWidth={1200}>
                <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-2">Ingredient / Packaging</th>
                    <th className="px-3 py-2 text-right">Required</th>
                    <th className="px-3 py-2 text-right">On Hand</th>
                    <th className="px-3 py-2 text-right">Short</th>
                    <th className="px-3 py-2 text-right">On Order</th>
                    <th className="px-3 py-2">Awaiting Purchasing / GRN</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Jobs Blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {r.shortages.map((m) => (
                    <tr key={m.key} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-bold text-slate-900">{m.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(m.required, 4)} {m.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.available === null ? "No stock record" : fmt(m.available, 4)}</td>
                      <td className="px-3 py-2 text-right font-black tabular-nums text-rose-700">{fmt(m.shortage, 4)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(m.onOrder, 4)}</td>
                      <td className="px-3 py-2 text-[12px]">{m.onOrderRefs.join("; ") || <span className="font-bold text-rose-700">Nothing on order</span>}</td>
                      <td className="px-3 py-2 font-bold text-rose-700">{m.status}</td>
                      <td className="px-3 py-2 text-[12px]">{m.jobs.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            ) : (
              <Empty text={r.kpis.jobsNotStarted + r.kpis.jobsInProgress + r.kpis.jobsOnHold ? "Every open job can be made from stock on hand." : "No open jobs to check."} />
            )}
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              Requirements are each open run&apos;s own issued lines. Stock on hand is allocated to open runs in schedule order, so stock
              already needed by an earlier run is not offered again to a later one. Open a job in the schedule for its line-by-line check.
            </p>
          </Section>

          <Section title={view === "monthly" ? "Monthly summary" : view === "weekly" ? "Weekly summary" : "Daily summary"}>
            {r.buckets.length ? (
              <ReportTable minWidth={900}>
                <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Jobs</th>
                    <th className="px-3 py-2 text-right">Completed</th>
                    <th className="px-3 py-2 text-right">Cancelled</th>
                    <th className="px-3 py-2 text-right">Planned</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">% of Target</th>
                    <th className="px-3 py-2 text-right">Production Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {r.buckets.map((b) => (
                    <tr key={b.from} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold text-slate-900">{b.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.jobs}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.completed}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.cancelled}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(b.plannedQty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(b.actualQty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(b.achievementPct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(b.productionCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            ) : (
              <Empty text="No jobs in this period." />
            )}
          </Section>

          <Section title="Production performance">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Total planned output" value={fmt(r.kpis.plannedUnits)} />
              <Metric label="Total actual output" value={fmt(r.kpis.actualUnits)} />
              <Metric label="Production variance" value={fmt(r.kpis.actualUnits - r.kpis.plannedUnits)} />
              <Metric label="Schedule adherence" value={pct(r.kpis.scheduleAdherencePct)} />
              <Metric label="On-time completion" value={pct(r.kpis.onTimeCompletionPct)} />
              <Metric label="Overdue jobs" value={String(r.kpis.jobsOverdue)} />
              <Metric label="Rejected units" value={r.kpis.rejectedUnits === null ? "Not captured" : fmt(r.kpis.rejectedUnits)} />
              <Metric label="Rework units" value={r.kpis.reworkUnits === null ? "Not captured" : fmt(r.kpis.reworkUnits)} />
              <Metric label="First-pass yield" value={pct(r.kpis.firstPassYieldPct)} />
              <Metric label="Downtime (minutes)" value={r.kpis.downtimeMinutes === null ? "Not captured" : fmt(r.kpis.downtimeMinutes)} />
              <Metric label="Production cost (completed)" value={money(r.kpis.productionCost)} />
              <Metric label="Output value (at selling price)" value={money(r.kpis.outputValue)} />
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] font-semibold text-slate-600">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Not calculated — the data is not captured</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {r.unavailable.map((u) => (
                  <li key={u.metric}>
                    <b>{u.metric}:</b> {u.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Planned date, required date, priority, area, responsible person, rejects, rework and downtime are captured on each run under{" "}
                <Link href="/manufacturing/runs" className="font-black text-blue-700 underline">
                  Production Runs
                </Link>{" "}
                → Production Control.
              </p>
            </div>
          </Section>
        </div>
      ) : null}
    </ReportDocument>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500">{text}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
    </div>
  );
}

function JobRow({ job: j, open, flagged, onToggle }: { job: ProductionJob; open: boolean; flagged: boolean; onToggle: () => void }) {
  const tone = j.overdue ? "bg-rose-50/70" : j.carriedForward ? "bg-amber-50/60" : j.urgent ? "bg-orange-50/50" : "";
  return (
    <Fragment>
      <tr className={`border-t border-slate-100 align-top ${tone}`}>
        <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">
          <button
            type="button"
            onClick={onToggle}
            className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[11px] print:hidden"
            aria-expanded={open}
            title="Show material requirement"
          >
            {open ? "−" : "+"}
          </button>
          <Link href={`/manufacturing/runs/${j.id}`} className="text-blue-700 hover:underline">
            {j.jobNumber}
          </Link>
          {j.carriedForward ? <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-black uppercase text-amber-900">Carried fwd</span> : null}
          {flagged ? <span className="ml-1 rounded bg-rose-100 px-1 text-[9px] font-black uppercase text-rose-700">Exception</span> : null}
        </td>
        <td className="px-3 py-2 font-bold text-slate-900">
          {j.product}
          {j.bomWarning ? <span className="mt-0.5 block text-[11px] font-semibold text-amber-800">{j.bomWarning}</span> : null}
        </td>
        <td className="px-3 py-2 text-slate-600">{j.itemCode ?? "—"}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {j.scheduleDate}
          {j.scheduleSource === "created" ? <span className="block text-[10px] font-bold text-slate-400">created date</span> : null}
          {j.originalPlannedDate && j.originalPlannedDate !== j.scheduleDate ? (
            <span className="block text-[10px] font-bold text-amber-700">originally {j.originalPlannedDate}</span>
          ) : null}
        </td>
        <td className={`px-3 py-2 whitespace-nowrap ${j.overdue ? "font-black text-rose-700" : ""}`}>{j.requiredDate ?? <span className="text-slate-400">Not captured</span>}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmt(j.plannedQty)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{j.actualRecorded ? fmt(j.actualQty) : <span className="text-slate-400">Not recorded</span>}</td>
        <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(j.outstandingQty)}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[j.status] ?? ""}`}>{j.status}</span>
          {j.overdue ? <span className="block text-[10px] font-black uppercase text-rose-700">Overdue</span> : null}
        </td>
        <td className={`px-3 py-2 ${j.urgent ? "font-black text-orange-700" : "text-slate-600"}`}>{j.priority ?? "—"}</td>
        <td className="px-3 py-2 text-slate-600">{j.area ?? "—"}</td>
        <td className="px-3 py-2 text-slate-600">{j.responsible ?? "—"}</td>
        <td className={`px-3 py-2 font-bold ${j.materialStatus === "Short" ? "text-rose-700" : j.materialStatus === "Ready" ? "text-emerald-700" : "text-slate-500"}`}>
          {j.materialStatus}
        </td>
      </tr>
      {open ? (
        <tr className="bg-slate-50">
          <td colSpan={13} className="px-4 py-3">
            {j.materials && j.materials.length ? (
              <table className="w-full min-w-[900px] border border-slate-200 bg-white text-left text-[11px]">
                <thead className="bg-slate-100 font-black uppercase text-slate-600">
                  <tr>
                    <th className="px-2 py-1">Ingredient / Packaging</th>
                    <th className="px-2 py-1 text-right">Required</th>
                    <th className="px-2 py-1 text-right">On Hand</th>
                    <th className="px-2 py-1 text-right">Allocated to Earlier Jobs</th>
                    <th className="px-2 py-1 text-right">Short</th>
                    <th className="px-2 py-1 text-right">On Order</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {j.materials.map((m) => (
                    <tr key={`${m.key}-${m.name}`} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-bold">{m.name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(m.required, 4)} {m.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{m.available === null ? "No stock record" : fmt(m.available, 4)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(m.allocatedToEarlierJobs, 4)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${m.shortage > 0 ? "font-black text-rose-700" : ""}`}>{fmt(m.shortage, 4)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(m.onOrder, 4)}</td>
                      <td className={`px-2 py-1 font-bold ${m.status === "Ready" ? "text-emerald-700" : "text-rose-700"}`}>{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] font-semibold text-slate-500">
                {j.materialStatus === "Consumed"
                  ? "Completed: its ingredients were consumed from stock at completion."
                  : j.status === "Cancelled"
                    ? "Cancelled: no material requirement."
                    : "This run has no ingredient or packaging lines to check."}
              </p>
            )}
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              Waste recorded: {fmt(j.wasteQty)} · Rejected: {j.rejectedQty === null ? "not captured" : fmt(j.rejectedQty)} · Rework:{" "}
              {j.reworkQty === null ? "not captured" : fmt(j.reworkQty)} · Downtime:{" "}
              {j.downtimeMinutes === null ? "not captured" : `${fmt(j.downtimeMinutes)} min${j.downtimeReason ? ` (${j.downtimeReason})` : ""}`} · Planned cost{" "}
              {money(j.plannedCost)} · Production cost {j.productionCost === null ? "—" : money(j.productionCost)}
            </p>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
