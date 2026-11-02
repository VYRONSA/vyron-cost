"use client";

import { useMemo, useState } from "react";
import type { ReorderReport } from "@/lib/vyron-reorder-report";
import { reorderReportCsv } from "@/lib/vyron-reorder-report-csv";

/** Low stock / minimum order level report: what to order, how much, and why. */
export default function ReorderReportClient({ report, loadError, companyName }: { report: ReorderReport | null; loadError: string | null; companyName: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => (report?.rows || []).filter((r) => showAll || r.needsOrdering || r.onHand < r.minimum), [report, showAll]);

  function downloadCsv() {
    const blob = new Blob([reorderReportCsv(report?.rows || [])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reorder-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loadError) return <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>;
  const s = report?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{companyName}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Items with a minimum level. Stock already on order is counted, so nothing covered by an open purchase order is ordered twice.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show items that do not need ordering
          </label>
          <button type="button" onClick={downloadCsv} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Items with a minimum", s?.configuredItems ?? 0],
          ["Need ordering", s?.needOrdering ?? 0],
          ["Critical", s?.critical ?? 0],
          ["Low, covered by open POs", s?.coveredByOpenOrders ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-950 text-left font-black uppercase tracking-[0.08em] text-white">
            <tr>
              <th className="px-3 py-2.5">Item</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">On order</th>
              <th className="px-3 py-2.5 text-right">Minimum</th>
              <th className="px-3 py-2.5">Needs ordering</th>
              <th className="px-3 py-2.5 text-right">Reorder qty</th>
              <th className="px-3 py-2.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stockItemId} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <span className="font-black text-slate-900">{r.description}</span>
                  <span className="block text-[11px] font-semibold text-slate-500">{[r.itemCode, r.unit].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-semibold text-slate-800">{r.supplier || "No supplier linked"}</span>
                  {r.supplierSource && r.supplierSource !== "ingredient" && r.supplierSource !== "made in-house" ? (
                    <span className="block text-[11px] font-semibold text-slate-500">from the {r.supplierSource}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{r.onHand}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.onOrder}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.minimum}</td>
                <td className="px-3 py-2">
                  {r.needsOrdering ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${r.status === "CRITICAL" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                      {r.status === "CRITICAL" ? "Order now" : "Order"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">No</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-black text-slate-950">{r.needsOrdering ? r.reorderQty : "—"}</td>
                <td className="px-3 py-2 font-semibold text-slate-700">{r.reason}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                  {report?.rows.length ? "Nothing needs ordering." : "No minimum levels are set. Set them under Inventory → Minimum Levels."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
