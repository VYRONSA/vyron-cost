"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import ReportDocument, { ReportTable } from "@/components/reports/ReportDocument";
import type { DifferenceCategory } from "@/lib/vyron-supplier-statement-match";
import { matchesSearch, reportableDifferences, reportSections, reportSummary, type DifferencesReportData } from "@/lib/vyron-supplier-differences-report";

const SECTION_FILTER_LABEL: Record<DifferenceCategory, string> = {
  AMOUNT_DIFFERENCE: "Amount differences",
  DATE_DIFFERENCE: "Date differences",
  NOTE_DIFFERENCE: "Credit / debit note differences",
  DUPLICATE: "Duplicates",
  MISSING_IN_VOLORA: "Missing in VOLORA",
  NEEDS_REVIEW: "Needs review",
  NOT_ON_STATEMENT: "In VOLORA, not on statement",
};

/**
 * The Supplier Statement Differences Report: every supplier document on which the statement and VOLORA
 * disagree, grouped by difference. Rendered in the shared report frame, so "Print Report" prints only
 * the report (no navigation, buttons or filters; table headers repeat; rows are not split) and the
 * browser's print dialog can save it as PDF. Display only — it writes nothing.
 */
export default function SupplierDifferencesReport({ data, onClose }: { data: DifferencesReportData; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<DifferenceCategory | "ALL">("ALL");
  const all = useMemo(() => reportableDifferences(data.differences), [data.differences]);
  const shown = useMemo(() => all.filter((d) => (only === "ALL" || d.category === only) && matchesSearch(d, query)), [all, only, query]);
  const sections = useMemo(() => reportSections(shown), [shown]);
  const present = useMemo(() => [...new Set(all.map((d) => d.category))], [all]);

  const subtitle = [
    data.statementDate ? `Statement date: ${data.statementDate}` : null,
    data.accountNumber ? `Account number: ${data.accountNumber}` : null,
    data.fileName ? `Statement: ${data.fileName}` : null,
    data.basis === "saved" ? `Recorded reconciliation${data.savedAt ? ` of ${new Date(data.savedAt).toLocaleString("en-ZA")}` : ""}` : "Preview — matched against VOLORA, not yet approved or recorded",
    `${data.summary.documents} supplier documents reviewed · ${all.length} difference${all.length === 1 ? "" : "s"}`,
    "Supplier documents only — payments and receipts are not part of this report.",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const filters = [
    ...(only !== "ALL" ? [{ key: "section", label: "Showing", value: SECTION_FILTER_LABEL[only] }] : []),
    ...(query.trim() ? [{ key: "search", label: "Search", value: query.trim() }] : []),
  ];

  return (
    <div className="grid gap-4">
      <ReportDocument
        reportKey="supplier-statement-differences"
        title="Supplier Statement Reconciliation — Differences Report"
        companyName={`Supplier: ${data.supplierName}`}
        subtitle={subtitle}
        period={{ kind: "range", from: data.periodFrom, to: data.periodTo }}
        generatedAt={data.generatedAt}
        filters={filters}
        summary={reportSummary(data.summary, data.differences)}
        isEmpty={all.length === 0}
        emptyMessage="Every supplier document on the statement agrees with VOLORA."
        controls={
          <>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(11,32,43,0.10)] bg-white px-3.5 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={14} />
              Back to reconciliation
            </button>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
              Show
              <select value={only} onChange={(e) => setOnly(e.target.value as DifferenceCategory | "ALL")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800">
                <option value="ALL">All differences ({all.length})</option>
                {present.map((c) => (
                  <option key={c} value={c}>
                    {SECTION_FILTER_LABEL[c]} ({all.filter((d) => d.category === c).length})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
              Search
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Document no., reference, amount…" className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800" />
            </label>
          </>
        }
      >
        <div className="grid gap-6">
          {sections.map((s) => (
            <section key={s.category} className="grid gap-2" data-report-section={s.category}>
              <div>
                <h2 className="text-base font-black uppercase tracking-[0.08em] text-slate-900">
                  {s.title} <span className="text-slate-500">({s.rows.length})</span>
                </h2>
                <p className="text-xs font-semibold text-slate-500">{s.description}</p>
              </div>
              <ReportTable minWidth={960}>
                <thead className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">
                  <tr>
                    {s.columns.map((c, i) => (
                      <th key={c} className={`px-3 py-2 ${s.numeric.includes(i) ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.key} className="border-t border-slate-100 align-top font-semibold text-slate-700">
                      {r.cells.map((cell, i) => (
                        <td key={i} className={`whitespace-pre-line px-3 py-2 ${s.numeric.includes(i) ? "text-right tabular-nums" : ""} ${i === 0 ? "font-black text-slate-900" : ""}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            </section>
          ))}
          {!sections.length && all.length ? <p className="text-sm font-semibold text-slate-500">No differences match this search.</p> : null}
        </div>
      </ReportDocument>
    </div>
  );
}
