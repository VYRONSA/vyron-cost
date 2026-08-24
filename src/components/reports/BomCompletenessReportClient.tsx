"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, formatQty, type ReportFilter } from "@/lib/vyron-report-exports";
import type { BomCompletenessReport, BomSeverity, BomStatus } from "@/lib/vyron-bom-completeness";

const ALL = "__all__";

const STATUSES: BomStatus[] = [
  "COMPLETE",
  "NO BOM",
  "EMPTY BOM",
  "INCOMPLETE",
  "MISSING COMPONENT",
  "NO COST",
];
const SEVERITIES: BomSeverity[] = ["Critical", "High", "Medium", "Low", "None"];

const STATUS_TONE: Record<BomStatus, string> = {
  COMPLETE: "bg-emerald-50 text-emerald-700",
  "NO BOM": "bg-rose-50 text-rose-700",
  "EMPTY BOM": "bg-amber-50 text-amber-800",
  INCOMPLETE: "bg-amber-50 text-amber-800",
  "MISSING COMPONENT": "bg-rose-50 text-rose-700",
  "NO COST": "bg-orange-50 text-orange-800",
};

const SEVERITY_TONE: Record<BomSeverity, string> = {
  Critical: "bg-rose-600 text-white",
  High: "bg-orange-500 text-white",
  Medium: "bg-amber-400 text-slate-900",
  Low: "bg-sky-100 text-sky-800",
  None: "bg-slate-100 text-slate-500",
};

/**
 * Finished Goods — BOM Completeness.
 *
 * The point of this report is not to list products without a recipe. It is to
 * tell the client which finished goods cannot currently produce a defensible
 * cost, how each one fails, what it is costing them in unproven margin, and
 * what to do about it — ordered so the most damaging sit at the top.
 *
 * Sales figures are recomputed on the server whenever the period changes, so
 * "Units Sold" and "Revenue" always belong to the period printed on the header.
 */
export default function BomCompletenessReportClient({
  report,
  companyName,
  generatedAt,
  loadError,
}: {
  report: BomCompletenessReport | null;
  companyName: string;
  generatedAt: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [attentionOnly, setAttentionOnly] = useState(false);

  const from = report?.from || "";
  const to = report?.to || "";

  const navigate = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      setPending(true);
      router.replace(`/reports/bom-completeness?${next.toString()}`);
      window.setTimeout(() => setPending(false), 900);
    },
    [params, router]
  );

  const allRows = useMemo(() => report?.rows ?? [], [report]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (category !== ALL && row.category !== category) return false;
      if (status !== ALL && row.bomStatus !== status) return false;
      if (severity !== ALL && row.severity !== severity) return false;
      if (attentionOnly && row.bomStatus === "COMPLETE") return false;
      if (term && !`${row.productName} ${row.productCode ?? ""} ${row.category}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allRows, search, category, status, severity, attentionOnly]);

  /** Totals are taken from the rows on screen so the footer cannot disagree. */
  /*
   * Products whose cost is unknown are excluded from the GP total rather than
   * counted at 100% margin, and the footer says how many were left out.
   */
  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const costed = filtered.filter((r) => r.gp !== null);
    const gp = costed.reduce((s, r) => s + (r.gp ?? 0), 0);
    const costedRevenue = costed.reduce((s, r) => s + r.revenue, 0);
    return {
      count: filtered.length,
      unitsSold: filtered.reduce((s, r) => s + r.unitsSold, 0),
      revenue,
      gp,
      gpPct: costedRevenue > 0 ? (gp / costedRevenue) * 100 : null,
      unknownCost: filtered.length - costed.length,
      components: filtered.reduce((s, r) => s + r.componentCount, 0),
    };
  }, [filtered]);

  const summary = report?.summary;

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (from) list.push({ key: "from", label: "Sales From", value: from });
    if (to) list.push({ key: "to", label: "Sales To", value: to });
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (category !== ALL) list.push({ key: "category", label: "Category", value: category });
    if (status !== ALL) list.push({ key: "status", label: "BOM Status", value: status });
    if (severity !== ALL) list.push({ key: "severity", label: "Severity", value: severity });
    if (attentionOnly) list.push({ key: "attention", label: "View", value: "Needs attention only" });
    return list;
  }, [from, to, search, category, status, severity, attentionOnly]);

  const period = useMemo(() => ({ kind: "range" as const, from: from || null, to: to || null }), [from, to]);

  const summaryTiles = useMemo(
    () =>
      summary
        ? [
            { label: "Total Finished Goods", value: String(summary.totalFinishedGoods) },
            { label: "Complete BOMs", value: String(summary.completeBoms) },
            { label: "No BOM", value: String(summary.noBom) },
            { label: "Incomplete BOMs", value: String(summary.incompleteBoms) },
            { label: "Missing Components", value: String(summary.missingComponents) },
            { label: "Products With No Cost", value: String(summary.productsWithNoCost) },
            { label: "Sold Without Usable BOM", value: String(summary.soldWithoutUsableBom) },
            { label: "Revenue At Risk", value: formatMoney(summary.totalRevenueAtRisk) },
          ]
        : [],
    [summary]
  );

  const columns = useMemo(
    () => [
      { key: "product", label: "Finished Good" },
      { key: "code", label: "Product Code/SKU" },
      { key: "category", label: "Category" },
      { key: "selling_price", label: "Selling Price" },
      { key: "product_cost", label: "Product Cost" },
      { key: "bom_status", label: "BOM Status" },
      { key: "severity", label: "Priority" },
      { key: "components", label: "Components" },
      { key: "missing", label: "Missing Components" },
      { key: "invalid", label: "Invalid Components" },
      { key: "bom_cost", label: "BOM Cost" },
      { key: "variance", label: "Cost Variance" },
      { key: "last_updated", label: "Last Updated" },
      { key: "units_sold", label: "Units Sold" },
      { key: "revenue", label: "Revenue" },
      { key: "gp", label: "GP" },
      { key: "gp_pct", label: "GP %" },
      { key: "action", label: "Recommended Action" },
    ],
    []
  );

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "bom-completeness",
        title: "Finished Goods — BOM Completeness",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: summaryTiles,
        columns,
        rows: filtered.map((r) => [
          r.productName,
          r.productCode ?? "—",
          r.category,
          r.sellingPrice > 0 ? formatMoney(r.sellingPrice) : "Not priced",
          r.productCost > 0 ? formatMoney(r.productCost) : "No cost",
          r.bomStatus,
          r.severity,
          String(r.componentCount),
          String(r.missingComponents),
          String(r.invalidComponents),
          r.bomCost !== null ? formatMoney(r.bomCost) : "—",
          r.costVariance !== null ? `${formatMoney(r.costVariance)} (${r.costVariancePct!.toFixed(1)}%)` : "—",
          r.lastUpdated ? r.lastUpdated.slice(0, 10) : "—",
          formatQty(r.unitsSold, 0),
          formatMoney(r.revenue),
          r.gp === null ? "Cost unknown" : formatMoney(r.gp),
          r.gpPct === null ? "Cost unknown" : `${r.gpPct.toFixed(1)}%`,
          r.recommendedAction,
        ]),
      }),
    [filtered, companyName, generatedAt, period, activeFilters, summaryTiles, columns]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="bom-completeness"
      title="Finished Goods — BOM Completeness"
      subtitle="Which finished goods can and cannot produce a defensible cost, why, and what to do about each."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      onRefresh={() => navigate({})}
      refreshing={pending}
      error={loadError}
      isEmpty={!loadError && allRows.length === 0}
      emptyMessage="No finished goods are loaded for this company, so BOM completeness cannot be assessed."
      summary={summaryTiles}
      controls={
        <>
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Sales From</span>
            <input
              type="date"
              defaultValue={from}
              onChange={(e) => navigate({ from: e.target.value })}
              className={controlClass}
            />
          </label>
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Sales To</span>
            <input
              type="date"
              defaultValue={to}
              onChange={(e) => navigate({ to: e.target.value })}
              className={controlClass}
            />
          </label>
          <label className="min-w-[200px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product, code or category…"
              className={controlClass}
            />
          </label>
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
              <option value={ALL}>All categories</option>
              {(report?.categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[170px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">BOM Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={controlClass}>
              <option value={ALL}>All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[140px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Priority</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={controlClass}>
              <option value={ALL}>All priorities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(e) => setAttentionOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-[11px] font-black uppercase tracking-[0.10em] text-slate-600">
              Needs attention only
            </span>
          </label>
        </>
      }
    >
      <ReportTable minWidth={2040}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Finished Good</th>
            <th className="px-3 py-2.5">Code/SKU</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Selling Price</th>
            <th className="px-3 py-2.5 text-right">Product Cost</th>
            <th className="px-3 py-2.5">BOM Status</th>
            <th className="px-3 py-2.5">Priority</th>
            <th className="px-3 py-2.5 text-right">Components</th>
            <th className="px-3 py-2.5 text-right">Missing</th>
            <th className="px-3 py-2.5 text-right">Invalid</th>
            <th className="px-3 py-2.5 text-right">BOM Cost</th>
            <th className="px-3 py-2.5 text-right">Cost Variance</th>
            <th className="px-3 py-2.5">Last Updated</th>
            <th className="px-3 py-2.5 text-right">Units Sold</th>
            <th className="px-3 py-2.5 text-right">Revenue</th>
            <th className="px-3 py-2.5 text-right">GP</th>
            <th className="px-3 py-2.5 text-right">GP %</th>
            <th className="px-3 py-2.5">Recommended Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.productId} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">
                {row.productName}
                {row.issues.length ? (
                  <span className="mt-0.5 block max-w-[280px] text-[11px] font-semibold leading-snug text-slate-500">
                    {row.issues[0]}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{row.productCode ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{row.category}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {row.sellingPrice > 0 ? formatMoney(row.sellingPrice) : <span className="text-slate-400">Not priced</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {row.productCost > 0 ? formatMoney(row.productCost) : <span className="font-black text-rose-700">No cost</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${STATUS_TONE[row.bomStatus]}`}
                >
                  {row.bomStatus}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${SEVERITY_TONE[row.severity]}`}
                >
                  {row.severity}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{row.componentCount}</td>
              <td
                className={`px-3 py-2 text-right font-black tabular-nums ${row.missingComponents > 0 ? "text-rose-700" : "text-slate-400"}`}
              >
                {row.missingComponents}
              </td>
              <td
                className={`px-3 py-2 text-right font-black tabular-nums ${row.invalidComponents > 0 ? "text-rose-700" : "text-slate-400"}`}
              >
                {row.invalidComponents}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {row.bomCost !== null ? formatMoney(row.bomCost) : <span className="text-slate-400">—</span>}
              </td>
              <td
                className={`px-3 py-2 whitespace-nowrap text-right font-black tabular-nums ${
                  row.costVariance === null ? "text-slate-400" : Math.abs(row.costVariancePct ?? 0) >= 5 ? "text-rose-700" : "text-slate-700"
                }`}
              >
                {row.costVariance !== null ? (
                  <>
                    {formatMoney(row.costVariance)}
                    <span className="block text-[10px] font-bold">{row.costVariancePct!.toFixed(1)}%</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">
                {row.lastUpdated ? row.lastUpdated.slice(0, 10) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatQty(row.unitsSold, 0)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {formatMoney(row.revenue)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {row.gp === null ? <span className="text-[11px] font-black text-amber-700">Cost unknown</span> : formatMoney(row.gp)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {row.gpPct === null ? (
                  <span className="text-[11px] font-black text-amber-700">Cost unknown</span>
                ) : row.revenue > 0 ? (
                  `${row.gpPct.toFixed(1)}%`
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 max-w-[260px] text-[12px] font-semibold leading-snug text-slate-700">
                {row.recommendedAction}
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={18} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No finished goods match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={7}>
              Totals — {totals.count} finished good{totals.count === 1 ? "" : "s"}
              {totals.unknownCost ? ` · GP excludes ${totals.unknownCost} product${totals.unknownCost === 1 ? "" : "s"} with no cost` : ""}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.components}</td>
            <td className="px-3 py-2.5" colSpan={5} />
            <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(totals.unitsSold, 0)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totals.revenue)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totals.gp)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.gpPct === null ? "—" : `${totals.gpPct.toFixed(1)}%`}</td>
            <td className="px-3 py-2.5" />
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
