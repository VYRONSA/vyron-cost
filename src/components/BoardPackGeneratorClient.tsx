"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import type { BoardPackData } from "@/lib/vyron-finance-intelligence";
import { exportBoardPackCsv, exportBoardPackExcel, exportBoardPackPdf } from "@/lib/vyron-board-pack-export";

export default function BoardPackGeneratorClient({ pack }: { pack: BoardPackData }) {
  const [dateRange, setDateRange] = useState(pack.meta.dateRangeLabel);
  const [busy, setBusy] = useState<string | null>(null);

  async function runExport(format: "pdf" | "excel" | "csv") {
    setBusy(format);
    try {
      const payload = { ...pack, meta: { ...pack.meta, dateRangeLabel: dateRange } };
      if (format === "pdf") exportBoardPackPdf(payload);
      else if (format === "excel") exportBoardPackExcel(payload);
      else exportBoardPackCsv(payload);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[2rem] bg-[#07110d] p-8 text-white">
      <h2 className="text-2xl font-black">Generate Executive Board Pack</h2>
      <p className="mt-2 text-sm text-slate-300">
        {pack.meta.companyName} · Boardroom-ready PDF, Excel and CSV with procurement, inventory, manufacturing, supplier,
        recovery, AI and audit sections.
      </p>
      <div className="mt-6 flex flex-wrap gap-4">
        <label className="text-xs font-black uppercase text-slate-400">
          Date range
          <input
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="mt-1 block w-64 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white"
          />
        </label>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runExport("pdf")}
          className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          <FileText size={16} /> {busy === "pdf" ? "Generating…" : "PDF"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runExport("excel")}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-[#07110d] disabled:opacity-50"
        >
          <FileSpreadsheet size={16} /> {busy === "excel" ? "Generating…" : "Excel"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runExport("csv")}
          className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-sm font-black disabled:opacity-50"
        >
          <Download size={16} /> {busy === "csv" ? "Generating…" : "CSV"}
        </button>
      </div>
    </section>
  );
}
