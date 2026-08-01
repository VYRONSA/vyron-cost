import type { ExtractionQualityReport } from "@/lib/vyron-extraction-quality-data";

/**
 * VYRON — Extraction quality KPIs for the Executive Dashboard.
 *
 * Operational intelligence, not technical diagnostics. Every figure answers a
 * question an executive would actually ask: how much of our invoice capture
 * lands correctly the first time, and how much of it costs us a person's
 * attention.
 *
 * Server component: no state, no effects, nothing interactive.
 */

type Tone = "success" | "warning" | "error" | "neutral";

/**
 * A KPI where higher is better (success rate, quality, completeness).
 * Bands match the Extraction Quality panel so the two never disagree.
 */
function toneForAchievement(value: number | null): Tone {
  if (value === null) return "neutral";
  if (value >= 90) return "success";
  if (value >= 75) return "warning";
  return "error";
}

/** A KPI where lower is better (retry rate, manual review, incomplete). */
function toneForBurden(value: number | null, warnAbove: number, failAbove: number): Tone {
  if (value === null) return "neutral";
  if (value > failAbove) return "error";
  if (value > warnAbove) return "warning";
  return "success";
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--vyron-elev-1)]">
      <div className="vyron-t-label text-[10px] text-slate-500">{label}</div>
      <div
        className={`vyron-t-metric mt-1 text-2xl font-black ${
          tone === "neutral" ? "text-slate-400" : `vyron-metric-${tone}`
        }`}
      >
        {value}
      </div>
      <p className="vyron-t-caption mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

const NOT_MEASURED = "—";

function pct(value: number | null) {
  return value === null ? NOT_MEASURED : `${value}%`;
}

export default function ExtractionQualityKpis({ report }: { report: ExtractionQualityReport }) {
  // Nothing has been extracted since the feature shipped. An all-dashes tile
  // would read as a broken widget; saying so is more useful.
  if (report.documentsAssessed === 0) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm" aria-label="Extraction quality">
        <div className="vyron-t-label text-[10px] text-slate-500">Invoice extraction quality</div>
        <p className="vyron-t-body mt-2 text-sm text-slate-500">
          No extraction quality data yet. Figures appear once invoices are processed.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm" aria-label="Extraction quality">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="vyron-t-title text-lg text-slate-900">Invoice Extraction Quality</h2>
          <p className="vyron-t-caption text-xs text-slate-500">
            Last {report.documentsAssessed} extracted{" "}
            {report.documentsAssessed === 1 ? "document" : "documents"} of the {report.windowSize} most recent
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="First-pass success"
          value={pct(report.firstPassSuccessRate)}
          hint="Fully verified with no retry"
          tone={toneForAchievement(report.firstPassSuccessRate)}
        />
        <Kpi
          label="Average quality"
          value={pct(report.averageQuality)}
          hint="Across all extracted documents"
          tone={toneForAchievement(report.averageQuality)}
        />
        <Kpi
          label="Average completeness"
          value={pct(report.averageCompleteness)}
          hint="Invoice lines captured"
          tone={toneForAchievement(report.averageCompleteness)}
        />
        <Kpi
          label="Retry rate"
          value={pct(report.retryRate)}
          hint="Needed more than one attempt"
          tone={toneForBurden(report.retryRate, 10, 25)}
        />
        <Kpi
          label="Manual review"
          value={pct(report.manualReviewRate)}
          hint="Requires an operator's attention"
          tone={toneForBurden(report.manualReviewRate, 20, 40)}
        />
        <Kpi
          label="Incomplete"
          value={pct(report.incompleteRate)}
          hint="Could not be fully read"
          tone={toneForBurden(report.incompleteRate, 2, 10)}
        />
      </div>
    </section>
  );
}
