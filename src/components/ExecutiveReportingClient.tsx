"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import type { BoardPackData, ExecutiveReportCategory } from "@/lib/vyron-finance-intelligence";
import { exportBoardPackCsv, exportBoardPackExcel, exportBoardPackPdf } from "@/lib/vyron-board-pack-export";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import {
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

export default function ExecutiveReportingClient({
  categories,
  boardPack,
}: {
  categories: ExecutiveReportCategory[];
  boardPack: BoardPackData;
}) {
  const { canExport } = useReportsPermissions();
  const [filter, setFilter] = useState("");

  const filtered = categories.filter((c) =>
    [c.title, c.description].join(" ").toLowerCase().includes(filter.trim().toLowerCase())
  );

  function exportCategory(catId: string, format: "pdf" | "excel" | "csv") {
    if (!canExport) return;
    const slice = { ...boardPack, meta: { ...boardPack.meta, dateRangeLabel: `${catId} report` } };
    if (format === "pdf") exportBoardPackPdf(slice);
    else if (format === "excel") exportBoardPackExcel(slice);
    else exportBoardPackCsv(slice);
  }

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="executive"
        badge="Premium Board Pack Workspace"
        title="Executive Reporting Centre"
        subtitle="Board-ready exports, financial intelligence reports, recovery packs and operational evidence in PDF, Excel and CSV format."
        quotes={[
          {
            label: "Board discipline",
            quote: "A good report does not just show numbers — it explains what management must do next.",
          },
          {
            label: "Audit confidence",
            quote: "Every export should help an owner defend decisions with evidence.",
          },
        ]}
      >
        {canExport ? (
          <>
            <button
              type="button"
              onClick={() => exportBoardPackPdf(boardPack)}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-violet-900 shadow-lg"
            >
              <FileText size={16} /> Full Board Pack PDF
            </button>
            <button
              type="button"
              onClick={() => exportBoardPackExcel(boardPack)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm"
            >
              <FileSpreadsheet size={16} /> Excel Pack
            </button>
            <button
              type="button"
              onClick={() => exportBoardPackCsv(boardPack)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm"
            >
              <Download size={16} /> CSV Pack
            </button>
          </>
        ) : null}
      </VyronPremiumHeroBanner>

      <div className="grid gap-4 lg:grid-cols-2">
        <VyronPremiumFormulaCard
          variant="light"
          eyebrow="Report discipline"
          title="What a board report should answer"
          formulas={[
            { label: "What happened?", formula: "Actual results + operational evidence" },
            { label: "Why did it happen?", formula: "Cost drivers + variance explanations" },
            { label: "What must change?", formula: "Action plan + owner + deadline" },
          ]}
        />
        <VyronPremiumFormulaCard
          eyebrow="Export layer"
          title="How VYRON packages evidence"
          formulas={[
            { label: "PDF", formula: "Board-ready executive pack" },
            { label: "Excel", formula: "Working analysis for finance teams" },
            { label: "CSV", formula: "Raw evidence for audit and import" },
          ]}
        />
      </div>

      <div className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <VyronPremiumSectionHeading
            eyebrow="Report library"
            title="Available reports"
            subtitle="Filter by topic, open the dashboard, or export the report in the required format."
          />
          <div className="flex min-w-[280px] items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <Sparkles size={18} className="text-violet-700" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter reports…"
              className="w-full bg-transparent text-sm font-black text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((cat) => (
            <article
              key={cat.id}
              className="group relative overflow-hidden rounded-[2rem] border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 p-6 shadow-[0_16px_45px_rgba(76,29,149,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(76,29,149,0.12)]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-fuchsia-200/40 blur-2xl" />
              <div className="relative">
                <div className="inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 shadow-sm">
                  Executive Report
                </div>
                <h3 className="mt-4 text-2xl font-black tracking-[-0.03em] text-slate-950">{cat.title}</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{cat.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={cat.href} className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-black text-white">
                    Open dashboard →
                  </Link>
                  {canExport && cat.exportFormats.includes("pdf") ? (
                    <button
                      type="button"
                      onClick={() => exportCategory(cat.id, "pdf")}
                      className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm"
                    >
                      <FileText size={14} /> PDF
                    </button>
                  ) : null}
                  {canExport && cat.exportFormats.includes("excel") ? (
                    <button
                      type="button"
                      onClick={() => exportCategory(cat.id, "excel")}
                      className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm"
                    >
                      <FileSpreadsheet size={14} /> Excel
                    </button>
                  ) : null}
                  {canExport && cat.exportFormats.includes("csv") ? (
                    <button
                      type="button"
                      onClick={() => exportCategory(cat.id, "csv")}
                      className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm"
                    >
                      <Download size={14} /> CSV
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
