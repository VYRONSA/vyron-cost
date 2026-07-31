"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReviewDraft } from "@/lib/vyron-document-review-client";
import { formatMoney, type InvoiceTotalsSummary } from "@/lib/vyron-invoice-line-math";

type Props = {
  draft: ReviewDraft;
  summary: InvoiceTotalsSummary;
  onUpdateExtracted: (patch: Partial<ReviewDraft["fields"]>) => void;
  onReconciliationNote: (note: string) => void;
};

function DiffCell({
  label,
  diff,
  rounding,
}: {
  label: string;
  diff: number | null;
  rounding?: boolean;
}) {
  if (diff === null) return null;
  const abs = Math.abs(diff);
  const isRounding = rounding ?? abs <= 1;
  return (
    <div className={`text-xs ${isRounding ? "font-semibold text-slate-600" : "font-black text-fuchsia-800"}`}>
      {label}: {diff > 0 ? "+" : ""}
      {formatMoney(diff, "")}
    </div>
  );
}

/** Compact banner above the line table — never replaces the table. */
export function InvoiceTotalsWarningBanner({ summary }: { summary: InvoiceTotalsSummary }) {
  const [open, setOpen] = useState(true);
  if (!summary.hasTotalsDifference) return null;

  const rounding = summary.hasRoundingDifference;
  const message = rounding
    ? `Rounding difference (max ${formatMoney(summary.maxAbsDiff, "")}) — line totals differ slightly from extracted invoice.`
    : "Invoice totals do not agree with line totals.";

  return (
    <div
      className={`shrink-0 border-b px-3 py-2 ${
        rounding ? "border-slate-200 bg-slate-50" : "border-fuchsia-300 bg-fuchsia-50"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`text-xs font-black ${rounding ? "text-slate-700" : "text-fuchsia-900"}`}>{message}</span>
        <ChevronDown size={14} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-1 flex flex-wrap gap-3">
          <DiffCell label="Δ Excl" diff={summary.diffExcl} rounding={rounding} />
          <DiffCell label="Δ VAT" diff={summary.diffVat} rounding={rounding} />
          <DiffCell label="Δ Incl" diff={summary.diffIncl} rounding={rounding} />
        </div>
      ) : null}
    </div>
  );
}

export default function InvoiceReviewTotalsFooter({
  draft,
  summary,
  onUpdateExtracted,
  onReconciliationNote,
}: Props) {
  const currency = draft.fields.currency || "ZAR";
  const rounding = summary.hasRoundingDifference;
  const [expanded, setExpanded] = useState(summary.hasTotalsDifference);

  const diffSummary =
    summary.diffIncl !== null
      ? `Δ Incl ${summary.diffIncl > 0 ? "+" : ""}${formatMoney(summary.diffIncl, "")}`
      : null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-100/80"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
          Totals · Excl {formatMoney(summary.sumExcl, currency)} · VAT {formatMoney(summary.sumVat, currency)} · Incl{" "}
          {formatMoney(summary.sumIncl, currency)}
        </span>
        {diffSummary ? (
          <span
            className={`text-[10px] font-black ${rounding ? "text-slate-600" : summary.hasMajorMismatch ? "text-fuchsia-800" : "text-slate-500"}`}
          >
            {rounding ? `Rounding ${diffSummary}` : diffSummary}
          </span>
        ) : null}
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded ? (
        <div className="max-h-[min(24vh,220px)] overflow-y-auto overscroll-contain border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Line totals (calculated)</div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-[10px] font-bold text-slate-500">Excl VAT</div>
                  <div className="font-black text-slate-900">{formatMoney(summary.sumExcl, currency)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">VAT</div>
                  <div className="font-black text-slate-900">{formatMoney(summary.sumVat, currency)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500">Incl VAT</div>
                  <div className="font-black text-slate-900">{formatMoney(summary.sumIncl, currency)}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Extracted invoice (editable)
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(
                  [
                    ["subtotal", "Excl VAT"],
                    ["vat", "VAT"],
                    ["total", "Incl VAT"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="grid gap-0.5">
                    <span className="text-[10px] font-bold text-slate-500">{label}</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-black text-slate-900"
                      value={String(draft.fields[key] ?? "")}
                      onChange={(e) => {
                        const num = e.target.value === "" ? null : Number(e.target.value);
                        onUpdateExtracted({ [key]: Number.isFinite(num) ? num : null });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {summary.hasTotalsDifference ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 ${
                rounding ? "border-slate-200 bg-white" : "border-fuchsia-200 bg-fuchsia-50"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Difference vs extracted invoice
              </div>
              <div className="mt-1 flex flex-wrap gap-4">
                <DiffCell label="Excl" diff={summary.diffExcl} rounding={rounding} />
                <DiffCell label="VAT" diff={summary.diffVat} rounding={rounding} />
                <DiffCell label="Incl" diff={summary.diffIncl} rounding={rounding} />
              </div>
              {rounding ? (
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  Within R1.00 — treated as rounding; approval is not blocked.
                </p>
              ) : null}
            </div>
          ) : null}

          {summary.hasMajorMismatch ? (
            <label className="mt-2 block">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Reconciliation reason (required above R1.00 difference)
              </span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                rows={2}
                value={draft.reconciliationNote || ""}
                onChange={(e) => onReconciliationNote(e.target.value)}
                placeholder="Explain the difference before approving…"
              />
            </label>
          ) : summary.hasRoundingDifference ? (
            <label className="mt-2 block">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Rounding note (optional)
              </span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                value={draft.reconciliationNote || ""}
                onChange={(e) => onReconciliationNote(e.target.value)}
                placeholder="e.g. Supplier PDF rounds VAT to nearest cent"
              />
            </label>
          ) : null}

          <p className="mt-2 text-[10px] font-semibold text-slate-500">
            {summary.ignoredCount} ignored · {summary.unmappedCount} active line(s) without match
          </p>
        </div>
      ) : null}
    </div>
  );
}
