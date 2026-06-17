"use client";

import { Download, Printer, X } from "lucide-react";
import SearchFilterBar from "@/components/SearchFilterBar";
import { VYRON_MASTER } from "@/components/vyron-ui/style-tokens";

const M = VYRON_MASTER;

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
    <section className={`p-6 ${M.lightCard}`}>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className={`text-2xl ${M.heading}`}>{title}</h2>
          <p className={`mt-2 max-w-3xl text-sm leading-7 ${M.muted}`}>{subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-3 print:hidden">
          {search ? (
            <button type="button" onClick={() => onSearch("")} className={`${M.secondaryBtn} px-4 py-3 text-xs`}>
              <X size={15} /> Clear Search
            </button>
          ) : null}
          <button type="button" onClick={() => window.print()} className={`${M.secondaryBtn} px-4 py-3 text-xs`}>
            <Printer size={15} /> Print
          </button>
          <button type="button" onClick={exportCsvFromVisibleTable} className={`${M.primaryBtn} px-4 py-3 text-xs`}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="print:hidden">
        <SearchFilterBar value={search} onChange={onSearch} placeholder="Search this report..." resultCount={resultCount} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        {children}
      </div>
    </section>
  );
}
