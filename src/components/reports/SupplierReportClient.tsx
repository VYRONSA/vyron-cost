"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { statusTone, type Supplier } from "@/lib/vyron-cost-data";
import type { ReportFilter } from "@/lib/vyron-report-exports";

const ALL = "__all__";
const TONE_CLASS: Record<string, string> = {
  red: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-800",
  emerald: "bg-emerald-50 text-emerald-700",
  slate: "bg-slate-100 text-slate-600",
};

/** Supplier Risk Report — a point-in-time view of the supplier master. */
export default function SupplierReportClient({
  suppliers,
  companyName,
  generatedAt,
}: {
  suppliers: Supplier[];
  companyName: string;
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);

  const categories = useMemo(
    () => [...new Set(suppliers.map((s) => String(s.category || "").trim()).filter(Boolean))].sort(),
    [suppliers]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (category !== ALL && String(s.category || "") !== category) return false;
      if (!term) return true;
      return [s.supplier_name, s.category, s.contact_email || "", s.invoice_email || "", s.risk_status]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [suppliers, search, category]);

  const stats = useMemo(() => {
    const withInvoiceEmail = filtered.filter((s) => s.invoice_email).length;
    const highRisk = filtered.filter((s) => statusTone(String(s.risk_status || "")) === "red").length;
    // Averaged only over suppliers that actually carry a movement figure — a
    // supplier with no recorded movement is unmeasured, not 0%.
    const measured = filtered.filter((s) => Number(s.last_price_movement || 0) !== 0);
    const avgMovement = measured.length
      ? measured.reduce((sum, s) => sum + Number(s.last_price_movement || 0), 0) / measured.length
      : 0;
    return { total: filtered.length, withInvoiceEmail, highRisk, measured: measured.length, avgMovement };
  }, [filtered]);

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (category !== ALL) list.push({ key: "category", label: "Category", value: category });
    return list;
  }, [search, category]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "supplier-risk",
        title: "Supplier Risk Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Suppliers", value: String(stats.total) },
          { label: "High Risk", value: String(stats.highRisk) },
          { label: "Invoice Ready", value: String(stats.withInvoiceEmail) },
          { label: "Movement Measured", value: String(stats.measured) },
          {
            label: "Average Movement",
            value: stats.measured ? `${stats.avgMovement.toFixed(1)}%` : "Not measured",
          },
        ],
        columns: [
          { key: "supplier", label: "Supplier" },
          { key: "category", label: "Category" },
          { key: "contact_email", label: "Contact Email" },
          { key: "invoice_email", label: "Invoice Email" },
          { key: "movement", label: "Last Movement" },
          { key: "risk", label: "Risk Status" },
        ],
        rows: filtered.map((s) => [
          String(s.supplier_name || "—"),
          String(s.category || "—"),
          String(s.contact_email || "Not captured"),
          String(s.invoice_email || "Not configured"),
          Number(s.last_price_movement || 0) !== 0 ? `${Number(s.last_price_movement).toFixed(1)}%` : "Not measured",
          String(s.risk_status || "Not assessed"),
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="supplier-risk"
      title="Supplier Risk Report"
      subtitle="Supplier categories, invoice routing readiness, price movement and risk state."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      isEmpty={suppliers.length === 0}
      emptyMessage="No suppliers are loaded for this company."
      summary={[
        { label: "Suppliers", value: String(stats.total) },
        { label: "High Risk", value: String(stats.highRisk) },
        { label: "Invoice Ready", value: String(stats.withInvoiceEmail) },
        { label: "Avg Movement", value: stats.measured ? `${stats.avgMovement.toFixed(1)}%` : "Not measured" },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Supplier, category or email…"
              className={controlClass}
            />
          </label>
          <label className="min-w-[180px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
              <option value={ALL}>All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <ReportTable minWidth={980}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Supplier</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Contact Email</th>
            <th className="px-3 py-2.5">Invoice Email</th>
            <th className="px-3 py-2.5 text-right">Last Movement</th>
            <th className="px-3 py-2.5">Risk Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const movement = Number(s.last_price_movement || 0);
            const tone = statusTone(String(s.risk_status || ""));
            return (
              <tr key={String(s.id)} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 font-black text-slate-900">{s.supplier_name}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{s.category || "—"}</td>
                <td className="px-3 py-2 font-semibold text-slate-600">
                  {s.contact_email || <span className="text-slate-400">Not captured</span>}
                </td>
                <td className="px-3 py-2 font-semibold text-slate-600">
                  {s.invoice_email || <span className="text-slate-400">Not configured</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                  {movement !== 0 ? `${movement.toFixed(1)}%` : <span className="text-slate-400">Not measured</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                      TONE_CLASS[tone] || TONE_CLASS.slate
                    }`}
                  >
                    {s.risk_status || "Not assessed"}
                  </span>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No suppliers match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </ReportTable>
    </ReportDocument>
  );
}
