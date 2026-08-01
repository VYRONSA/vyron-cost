"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  ExtractionClassification,
  ExtractionQualityRecord,
} from "@/lib/vyron-extraction-quality";

/**
 * VYRON — Extraction Quality panel.
 *
 * Surfaces what the extraction engine measured, in the operator's language.
 *
 * The engine already knew when an invoice came back short; that knowledge lived
 * only in the run log and in a reduced confidence score. This panel is where it
 * becomes visible at the point of review.
 *
 * DELIBERATELY NOT SHOWN
 * ----------------------
 * No raw JSON, no model identifiers, no token counts, no reason codes, no
 * variance-versus-tolerance arithmetic. The operator's question is "can I trust
 * this, and what do I check" — not "what did the engine do". Diagnostics for
 * engineers remain in the extraction run log.
 *
 * Styling is Enterprise Design Language only: semantic status tokens for state,
 * the shared type scale, hairline borders. No page-specific colour.
 */

type Tone = "success" | "warning" | "error";

const CLASSIFICATION_TONE: Record<ExtractionClassification, Tone> = {
  Verified: "success",
  "Needs Review": "warning",
  Incomplete: "error",
};

const CLASSIFICATION_SUMMARY: Record<ExtractionClassification, string> = {
  Verified: "Every invoice line was read and the totals agree. No action needed.",
  "Needs Review": "The invoice was read, but something needs a second look before approval.",
  Incomplete: "Part of this invoice could not be read. Check it against the document before approving.",
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0">
      <div className="vyron-t-label text-[10px] text-slate-500">{label}</div>
      <div className={`vyron-t-metric text-lg font-black ${tone ? `vyron-metric-${tone}` : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

export default function ExtractionQualityPanel({ record }: { record: ExtractionQualityRecord | null }) {
  const [open, setOpen] = useState(true);

  // Documents extracted before extraction quality shipped carry no record.
  // Showing an empty panel would imply a measurement that never happened.
  if (!record) return null;

  const tone = CLASSIFICATION_TONE[record.classification];

  // Row counts read as a fraction only when the document told us what to expect.
  const rowsValue =
    record.declaredLineCount === null
      ? String(record.extractedLineCount)
      : `${record.extractedLineCount} / ${record.declaredLineCount}`;
  const rowsTone: Tone | undefined =
    record.declaredLineCount === null
      ? undefined
      : record.extractedLineCount < record.declaredLineCount
        ? "error"
        : "success";

  const completenessTone: Tone | undefined =
    record.completenessPercentage === null
      ? undefined
      : record.completenessPercentage >= 100
        ? "success"
        : record.completenessPercentage >= 90
          ? "warning"
          : "error";

  const reconciliationTone: Tone =
    record.reconciliationStatus === "Reconciled"
      ? "success"
      : record.reconciliationStatus === "Not reconciled"
        ? "error"
        : "warning";

  /*
   * Warnings and retry reasons are NOT the same thing and must not be merged.
   *
   * Warnings describe the extraction the operator is looking at. Retry reasons
   * describe attempts that were thrown away. Showing both under one heading put
   * "fewer rows were returned" next to a panel reading 40/40 rows and 100%
   * complete — the retry had already fixed it, and the note read as a live
   * problem that did not exist.
   */
  const toCheck = record.warnings;
  const retryTone: Tone = toCheck.length ? tone : "success";

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white/80 shadow-[var(--vyron-elev-2)]"
      aria-label="Extraction quality"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="vyron-t-label text-[10px] text-slate-500">Extraction quality</span>
          <span className={`vyron-status vyron-status-${tone}`}>{record.classification}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className={`vyron-t-metric text-base font-black vyron-metric-${tone}`}>{record.quality}%</span>
          <span className="vyron-t-caption hidden text-xs text-slate-500 sm:inline">{record.qualityBand}</span>
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="vyron-t-body mb-3 text-xs text-slate-600">{CLASSIFICATION_SUMMARY[record.classification]}</p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Metric label="Rows read" value={rowsValue} tone={rowsTone} />
            <Metric
              label="Completeness"
              value={record.completenessPercentage === null ? "Not measurable" : `${record.completenessPercentage}%`}
              tone={completenessTone}
            />
            <Metric label="Totals" value={record.reconciliationStatus} tone={reconciliationTone} />
            <Metric
              label="Retries"
              value={record.retryCount === 0 ? "None" : String(record.retryCount)}
              tone={record.retryCount === 0 ? "success" : "warning"}
            />
          </div>

          {record.declaredLineCount !== null ? (
            <p className="vyron-t-caption mt-2 text-[11px] text-slate-500">
              The document appeared to contain {record.declaredLineCount}{" "}
              {record.declaredLineCount === 1 ? "invoice line" : "invoice lines"}.
            </p>
          ) : null}

          {toCheck.length ? (
            <div className={`vyron-alert vyron-alert-${tone === "success" ? "info" : tone} mt-3`}>
              <div className="vyron-t-label mb-1 text-[10px]">What to check</div>
              <ul className="vyron-t-body list-disc space-y-1 pl-4 text-xs">
                {toCheck.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {record.retryCount > 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="vyron-t-label text-[10px] text-slate-500">
                Re-read {record.retryCount === 1 ? "once" : `${record.retryCount} times`}
                {toCheck.length ? "" : " — resolved"}
              </div>
              <ul className="vyron-t-body mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
                {record.retryReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className={`vyron-t-caption mt-1 text-[11px] ${`vyron-metric-${retryTone}`}`}>
                {toCheck.length
                  ? "The final attempt is the one shown above."
                  : "The final attempt read the invoice in full."}
              </p>
            </div>
          ) : null}

          {record.confidence !== null ? (
            <p className="vyron-t-caption mt-3 text-[11px] text-slate-400">
              AI confidence {Math.round(record.confidence)}% — informative only. Review state is decided by the checks
              above.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
