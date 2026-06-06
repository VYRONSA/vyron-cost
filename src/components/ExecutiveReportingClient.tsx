"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import type { BoardPackData, ExecutiveReportCategory } from "@/lib/vyron-finance-intelligence";
import { exportBoardPackCsv, exportBoardPackExcel, exportBoardPackPdf } from "@/lib/vyron-board-pack-export";

export default function ExecutiveReportingClient({
  categories,
  boardPack,
}: {
  categories: ExecutiveReportCategory[];
  boardPack: BoardPackData;
}) {
  const [filter, setFilter] = useState("");

  const filtered = categories.filter((c) =>
    [c.title, c.description].join(" ").toLowerCase().includes(filter.trim().toLowerCase())
  );

  function exportCategory(catId: string, format: "pdf" | "excel" | "csv") {
    const slice = { ...boardPack, meta: { ...boardPack.meta, dateRangeLabel: `${catId} report` } };
    if (format === "pdf") exportBoardPackPdf(slice);
    else if (format === "excel") exportBoardPackExcel(slice);
    else exportBoardPackCsv(slice);
  }

  return (
    <section className="grid gap-6">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter reports…"
        className="max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((cat) => (
          <article key={cat.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-slate-900">{cat.title}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">{cat.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={cat.href} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white">
                Open dashboard →
              </Link>
              {cat.exportFormats.includes("pdf") ? (
                <button
                  type="button"
                  onClick={() => exportCategory(cat.id, "pdf")}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black"
                >
                  <FileText size={14} /> PDF
                </button>
              ) : null}
              {cat.exportFormats.includes("excel") ? (
                <button
                  type="button"
                  onClick={() => exportCategory(cat.id, "excel")}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
              ) : null}
              {cat.exportFormats.includes("csv") ? (
                <button
                  type="button"
                  onClick={() => exportCategory(cat.id, "csv")}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black"
                >
                  <Download size={14} /> CSV
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
