"use client";

import { Download, Printer, X } from "lucide-react";
import SearchFilterBar from "@/components/SearchFilterBar";

export default function ReportTableShell({
  title,
  subtitle,
  search,
  onSearch,
  resultCount,
  exportFileName = "vyron-cost-report.csv",
  children,
}: {
  title: string;
  subtitle: string;
  search: string;
  onSearch: (value: string) => void;
  resultCount: number;
  exportFileName?: string;
  children: React.ReactNode;
}) {
  function exportCsvFromVisibleTable() {
    const table = document.querySelector("[data-report-table]") as HTMLTableElement | null;
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((cell) => `"${(cell.textContent || "").trim().replaceAll('"', '""')}"`).join(",")
    );
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)]">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">{subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-3 print:hidden">
          {search ? (
            <button type="button" onClick={() => onSearch("")} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-xs font-black text-slate-700">
              <X size={15} /> Clear Search
            </button>
          ) : null}
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-3 text-xs font-black text-violet-800">
            <Printer size={15} /> Print
          </button>
          <button type="button" onClick={exportCsvFromVisibleTable} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-xs font-black text-white">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="print:hidden">
        <SearchFilterBar value={search} onChange={onSearch} placeholder="Search this report..." resultCount={resultCount} />
      </div>

      {children}
    </section>
  );
}
