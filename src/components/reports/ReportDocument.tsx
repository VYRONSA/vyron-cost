"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, Printer, RefreshCw, AlertTriangle } from "lucide-react";
import { VyronLogoLockup } from "@/components/vyron-ui/VyronLogo";
import {
  exportTenantReportCsv,
  exportTenantReportExcel,
  exportTenantReportPdf,
} from "@/lib/vyron-report-pdf-export";
import { buildReportFileName, type ReportFilter, type TenantReportExportPayload } from "@/lib/vyron-report-exports";

/**
 * VYRON COST — the report document frame.
 *
 * Every report under /reports renders inside this. It supplies the things a
 * client-facing financial report has to carry on the page itself rather than
 * only in the browser chrome: the VYRON COST lockup, the company the figures
 * belong to, the period or as-at date they cover, when they were generated, and
 * which filters were actually applied.
 *
 * It also owns the export and print behaviour, so a report author supplies data
 * and gets CSV, Excel, PDF and a print layout without repeating any of it.
 *
 * PRINTING
 * --------
 * Printing hides everything on the page except this document, using a
 * visibility sweep rather than structural selectors. Selecting the sidebar and
 * top bar by class would break the moment the shell changes; hiding everything
 * and re-showing the document cannot. See `.vyron-report-document` in
 * globals.css.
 */

export type ReportPeriod =
  /** A range: "Reporting Period: 01 June 2026 - 31 July 2026". */
  | { kind: "range"; from: string | null; to: string | null }
  /** A snapshot: "As At: 31 July 2026". */
  | { kind: "asAt"; date: string | null };

/*
 * Both formatters are pinned to a fixed zone.
 *
 * Without it Intl uses whatever zone the runtime is in: UTC on the server,
 * the operator's zone in the browser. The two then render different text for
 * the same instant and React fails hydration (error #418) on every report.
 * Pinning also makes the reported time the one the business actually works in,
 * so a report generated at 10:53 says 10:53 rather than 08:53Z.
 */
const REPORT_TIME_ZONE = "Africa/Johannesburg";

const DATE_FMT = new Intl.DateTimeFormat("en-ZA", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});
const STAMP_FMT = new Intl.DateTimeFormat("en-ZA", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: REPORT_TIME_ZONE,
});

function formatDay(value: string | null | undefined) {
  if (!value) return null;
  // A bare date is anchored at midday so a timezone offset can never roll it
  // back or forward a day between server and client.
  const d = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? String(value) : DATE_FMT.format(d);
}

export function formatStamp(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : STAMP_FMT.format(d);
}

/** The period line exactly as it should read on the printed report. */
export function periodLabel(period: ReportPeriod | undefined): string | null {
  if (!period) return null;
  if (period.kind === "asAt") {
    const d = formatDay(period.date);
    return d ? `As At: ${d}` : null;
  }
  const from = formatDay(period.from);
  const to = formatDay(period.to);
  if (from && to) return `Reporting Period: ${from} – ${to}`;
  if (from) return `Reporting Period: From ${from}`;
  if (to) return `Reporting Period: To ${to}`;
  return "Reporting Period: All dates";
}

export type ReportDocumentProps = {
  /** Stable key used for file names and export audit. */
  reportKey: string;
  title: string;
  subtitle?: string;
  companyName: string;
  period?: ReportPeriod;
  /** ISO timestamp captured when the data was produced. */
  generatedAt: string;
  /** Only filters actually applied — never render an unset filter. */
  filters?: ReportFilter[];
  /** Controls rendered above the data: date pickers, search, category, etc. */
  controls?: ReactNode;
  /** Key figures for the summary band. */
  summary?: Array<{ label: string; value: string }>;
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Build the export payload. Called on demand so a report never serialises
   * rows it does not need to.
   */
  getExportPayload?: () => TenantReportExportPayload | Promise<TenantReportExportPayload>;
  /** Fatal load error. Shown once with a Retry — never retried automatically. */
  error?: string | null;
  /** True when the report ran successfully and legitimately has no rows. */
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
};

export default function ReportDocument({
  reportKey,
  title,
  subtitle,
  companyName,
  period,
  generatedAt,
  filters = [],
  controls,
  summary = [],
  onRefresh,
  refreshing = false,
  getExportPayload,
  error = null,
  isEmpty = false,
  emptyMessage = "No data available for the selected period.",
  children,
}: ReportDocumentProps) {
  const [busy, setBusy] = useState<"csv" | "excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = useCallback(
    async (kind: "csv" | "excel" | "pdf") => {
      if (!getExportPayload) return;
      setExportError(null);
      setBusy(kind);
      try {
        const payload = await getExportPayload();
        if (kind === "csv") exportTenantReportCsv(payload);
        else if (kind === "excel") exportTenantReportExcel(payload);
        else exportTenantReportPdf(payload);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : `${kind.toUpperCase()} export failed.`);
      } finally {
        setBusy(null);
      }
    },
    [getExportPayload]
  );

  const printReport = useCallback(() => {
    // The class scopes the print rules so nothing else on the page prints.
    document.body.classList.add("vyron-printing-report");
    const cleanup = () => {
      document.body.classList.remove("vyron-printing-report");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Safari/Firefox fire afterprint reliably; this is the belt-and-braces path.
    window.setTimeout(cleanup, 1000);
  }, []);

  const periodText = periodLabel(period);
  const activeFilters = filters.filter((f) => f.value !== "" && f.value != null);

  return (
    <div className="vyron-report-document flex min-w-0 flex-col gap-4">
      {/* ---------- report header: appears on screen, print and PDF ---------- */}
      <header className="vyron-report-header rounded-[20px] border border-[rgba(15,23,42,0.10)] bg-white px-6 py-5 shadow-[0_10px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <VyronLogoLockup variant="onLight" size={44} suffix="COST" />
            <h1 className="mt-4 text-2xl font-black uppercase tracking-[0.06em] text-slate-950 md:text-[1.7rem]">
              {title}
            </h1>
            <p className="mt-1 text-base font-bold text-slate-700">{companyName}</p>
            {subtitle ? <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">{subtitle}</p> : null}
          </div>

          <dl className="min-w-[240px] shrink-0 space-y-1 text-right text-sm">
            {periodText ? (
              <div>
                <dt className="sr-only">Period</dt>
                <dd className="font-black text-slate-900">{periodText}</dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Generated</dt>
              <dd className="font-semibold text-slate-600">Generated: {formatStamp(generatedAt)}</dd>
            </div>
          </dl>
        </div>

        {activeFilters.length ? (
          <p className="mt-4 border-t border-[rgba(15,23,42,0.08)] pt-3 text-xs font-bold uppercase tracking-[0.10em] text-slate-600">
            {activeFilters.map((f) => `${f.label}: ${f.value}`).join("  |  ")}
          </p>
        ) : null}
      </header>

      {/* ---------- controls: never printed ---------- */}
      {controls || onRefresh || getExportPayload ? (
        <section className="vyron-report-controls rounded-[20px] border border-[rgba(15,23,42,0.09)] bg-white/90 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-end gap-3">{controls}</div>
            <div className="flex flex-wrap items-center gap-2">
              {onRefresh ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white px-3.5 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  Refresh
                </button>
              ) : null}
              {getExportPayload ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runExport("csv")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-800 transition hover:bg-slate-200 disabled:opacity-50"
                  >
                    <Download size={14} />
                    {busy === "csv" ? "Exporting…" : "Export CSV"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runExport("excel")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <FileSpreadsheet size={14} />
                    {busy === "excel" ? "Exporting…" : "Export Excel"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runExport("pdf")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    <FileText size={14} />
                    {busy === "pdf" ? "Exporting…" : "Export PDF"}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={printReport}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-black text-white transition hover:bg-slate-800"
              >
                <Printer size={14} />
                Print Report
              </button>
            </div>
          </div>
          {exportError ? (
            <p className="mt-3 text-xs font-black text-rose-700" role="alert">
              {exportError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ---------- summary ---------- */}
      {summary.length ? (
        <section className="vyron-report-summary grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {summary.map((tile) => (
            <div
              key={tile.label}
              className="rounded-2xl border border-[rgba(15,23,42,0.09)] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{tile.label}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{tile.value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---------- body: error, empty, or the report itself ---------- */}
      {error ? (
        <section
          role="alert"
          className="vyron-report-body rounded-[20px] border border-rose-200 bg-rose-50 px-6 py-8 text-center"
        >
          <AlertTriangle size={22} className="mx-auto text-rose-600" />
          <p className="mt-3 text-base font-black text-rose-900">This report could not be produced.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm font-semibold text-rose-800">{error}</p>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Retry
            </button>
          ) : null}
        </section>
      ) : isEmpty ? (
        <section className="vyron-report-body rounded-[20px] border border-dashed border-[rgba(15,23,42,0.16)] bg-white px-6 py-12 text-center">
          <p className="text-base font-black text-slate-800">No data available</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm font-semibold text-slate-500">{emptyMessage}</p>
        </section>
      ) : (
        <section className="vyron-report-body min-w-0">{children}</section>
      )}

      {/*
        Printed footer. Chromium only exposes page counters inside @page margin
        boxes, which cannot carry this much text, so this repeats the report
        identity on every sheet rather than showing a page number that would be
        wrong. See globals.css.
      */}
      <footer className="vyron-report-footer" aria-hidden="true">
        VYRON COST &middot; {companyName} &middot; {title}
        {periodText ? ` · ${periodText}` : ""} &middot; Generated {formatStamp(generatedAt)}
      </footer>
    </div>
  );
}

/** Shared table wrapper: marks the grid for CSV capture and print pagination. */
export function ReportTable({ children, minWidth = 1000 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="vyron-report-table-wrap w-full overflow-x-auto rounded-[18px] border border-[rgba(15,23,42,0.10)] bg-white">
      <table data-report-table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/**
 * Assemble a TenantReportExportPayload from what a report already has on screen.
 *
 * Keeps CSV, Excel and PDF fed from exactly the rows, totals and filters the
 * operator is looking at, so an export can never disagree with the screen.
 */
export function buildReportPayload(input: {
  reportKey: string;
  title: string;
  companyName: string;
  generatedAt: string;
  period?: ReportPeriod;
  filters: ReportFilter[];
  summary: Array<{ label: string; value: string }>;
  columns: Array<{ key: string; label: string }>;
  rows: string[][];
}): TenantReportExportPayload {
  return {
    reportKey: input.reportKey,
    title: input.title,
    subtitle: periodLabel(input.period) || "",
    fileName: buildReportFileName(input.reportKey, input.companyName, input.generatedAt),
    generatedAt: input.generatedAt,
    branding: { companyName: input.companyName, tradingName: null },
    filters: input.filters,
    summary: input.summary,
    columns: input.columns,
    rows: input.rows,
  };
}
