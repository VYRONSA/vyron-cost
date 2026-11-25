"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, formatQty, type ReportFilter } from "@/lib/vyron-report-exports";
import type {
  BomClassification,
  BomCompletenessReport,
  BomCompletenessRow,
  BomLineDetail,
  BomSeverity,
  BomStatus,
} from "@/lib/vyron-bom-completeness";

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

const CLASSIFICATION_LABEL: Record<BomClassification, string> = {
  VERIFIED_COMPLETE: "System-verified complete",
  INCOMPLETE: "System-identified incomplete",
  OVERRIDDEN: "Manually Overridden",
};
const CLASSIFICATION_TONE: Record<BomClassification, string> = {
  VERIFIED_COMPLETE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  INCOMPLETE: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  OVERRIDDEN: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
};

const INGREDIENT_STATE_LABEL: Record<BomLineDetail["ingredientState"], string> = {
  valid: "Linked — current record",
  deleted: "Deleted ingredient record",
  unlinked: "Unlinked (text only)",
  "sub-bom": "Sub-BOM",
  "sub-bom-deleted": "Deleted Sub-BOM",
  blank: "Invalid (blank line)",
};
const COST_STATE_LABEL: Record<BomLineDetail["costState"], string> = {
  costed: "Costed on line",
  "ingredient-cost-only": "Cost from ingredient only",
  zero: "Zero / missing cost",
};

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
  canOverride = false,
}: {
  report: BomCompletenessReport | null;
  companyName: string;
  generatedAt: string;
  loadError: string | null;
  canOverride?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [classification, setClassification] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [overrideTarget, setOverrideTarget] = useState<{ row: BomCompletenessRow; mode: "create" | "remove" } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      if (classification !== ALL && row.classification !== classification) return false;
      if (term && !`${row.productName} ${row.productCode ?? ""} ${row.category}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allRows, search, category, status, severity, attentionOnly, classification]);

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
    if (classification !== ALL)
      list.push({ key: "classification", label: "Classification", value: CLASSIFICATION_LABEL[classification as BomClassification] });
    return list;
  }, [from, to, search, category, status, severity, attentionOnly, classification]);

  const period = useMemo(() => ({ kind: "range" as const, from: from || null, to: to || null }), [from, to]);

  const summaryTiles = useMemo(
    () =>
      summary
        ? [
            { label: "Active Finished Goods", value: String(summary.totalFinishedGoods) },
            { label: "System-Verified Complete", value: String(summary.systemVerifiedComplete) },
            { label: "System-Identified Incomplete", value: String(summary.systemIdentifiedIncomplete) },
            { label: "Manually Overridden", value: String(summary.manuallyOverridden) },
            { label: "Archived (Excluded)", value: String(summary.archivedExcluded) },
            { label: "Complete BOMs", value: String(summary.completeBoms) },
            { label: "No BOM", value: String(summary.noBom) },
            { label: "Empty / Incomplete BOMs", value: String(summary.incompleteBoms) },
            { label: "Missing Components", value: String(summary.missingComponents) },
            { label: "Products With No Cost", value: String(summary.productsWithNoCost) },
            { label: "Sold Without Usable BOM", value: String(summary.soldWithoutUsableBom) },
            { label: "Revenue At Risk (incl. overridden)", value: formatMoney(summary.totalRevenueAtRisk) },
            { label: "Of Which Overridden", value: formatMoney(summary.overriddenRevenueAtRisk) },
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
      { key: "bom", label: "BOM (Name / ID / Status)" },
      { key: "bom_status", label: "BOM Status" },
      { key: "classification", label: "Classification" },
      { key: "reason", label: "Precise Reason" },
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
      { key: "override", label: "Override (By / When / Reason)" },
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
          r.bomId ? `${r.bomName ?? "Unnamed"} / ${r.bomId} / ${r.bomRecordStatus ?? "no status"}` : "No BOM",
          r.bomStatus,
          CLASSIFICATION_LABEL[r.classification],
          r.classificationReason,
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
          r.override
            ? `${r.override.createdBy} / ${r.override.createdAt.slice(0, 16).replace("T", " ")} / ${r.override.reason}`
            : r.staleOverride
              ? `Not applied (stale): ${r.staleOverride.staleReason}`
              : "—",
        ]),
      }),
    [filtered, companyName, generatedAt, period, activeFilters, summaryTiles, columns]
  );

  const submitOverride = useCallback(async () => {
    if (!overrideTarget) return;
    setOverrideBusy(true);
    setOverrideError(null);
    try {
      const { row, mode } = overrideTarget;
      const res = await fetch("/api/reports/bom-completeness/overrides", {
        method: mode === "create" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "create" ? { productId: row.productId, reason: overrideReason } : { overrideId: row.override?.id, reason: overrideReason }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setNotice(
        mode === "create"
          ? `"${row.productName}" is now reported as Manually Overridden. The BOM, its ingredients and its cost were not changed.`
          : `Override removed for "${row.productName}". The report shows the system classification again.`
      );
      setOverrideTarget(null);
      setOverrideReason("");
      navigate({});
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "The override could not be saved.");
    } finally {
      setOverrideBusy(false);
    }
  }, [overrideTarget, overrideReason, navigate]);

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

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
          <label className="min-w-[200px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Classification</span>
            <select value={classification} onChange={(e) => setClassification(e.target.value)} className={controlClass}>
              <option value={ALL}>All classifications</option>
              {(Object.keys(CLASSIFICATION_LABEL) as BomClassification[]).map((c) => (
                <option key={c} value={c}>
                  {CLASSIFICATION_LABEL[c]}
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
      <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-[12px] font-semibold leading-relaxed text-violet-900 print:hidden">
        <span className="font-black">Classifications.</span> <b>System-verified complete</b>: every component resolves, has a
        quantity and the BOM produces a cost. <b>System-identified incomplete</b>: the system found the exceptions listed on the
        row. <b>Manually Overridden</b>: an authorised user confirmed the BOM is valid for operational purposes. An override
        changes the reporting classification only — it does not repair the underlying data, it never changes costing or stock
        deduction, and Revenue at Risk still includes overridden rows (disclosed separately). Open a row (+) to see the exact
        exceptions and BOM lines.
        {report?.overridesAvailable === false ? (
          <span className="mt-1 block font-black text-rose-700">
            Overrides cannot be recorded yet: the override table has not been created in this database.
          </span>
        ) : null}
      </div>
      {notice ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] font-bold text-emerald-800 print:hidden">
          {notice}
        </div>
      ) : null}
      <ReportTable minWidth={2200}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Finished Good</th>
            <th className="px-3 py-2.5">Code/SKU</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Selling Price</th>
            <th className="px-3 py-2.5 text-right">Product Cost</th>
            <th className="px-3 py-2.5">BOM Status</th>
            <th className="px-3 py-2.5">Classification</th>
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
            <Fragment key={row.productId}>
            <tr className="border-t border-slate-100 align-top hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">
                <button
                  type="button"
                  onClick={() => toggle(row.productId)}
                  aria-expanded={expanded.has(row.productId)}
                  className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[11px] font-black text-slate-600 print:hidden"
                  title="Show exceptions and BOM lines"
                >
                  {expanded.has(row.productId) ? "−" : "+"}
                </button>
                {row.productName}
                <span className="mt-0.5 block max-w-[300px] text-[11px] font-semibold leading-snug text-slate-500">
                  {row.classificationReason}
                </span>
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
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ${CLASSIFICATION_TONE[row.classification]}`}
                >
                  {CLASSIFICATION_LABEL[row.classification]}
                </span>
                {row.staleOverride ? (
                  <span className="mt-1 block text-[10px] font-black uppercase text-amber-700">Override not applied (stale)</span>
                ) : null}
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
            {expanded.has(row.productId) ? (
              <tr className="bg-slate-50/80">
                <td colSpan={19} className="px-4 py-4">
                  <BomExceptionDetail
                    row={row}
                    canOverride={canOverride && report?.overridesAvailable !== false}
                    onOverride={(mode) => {
                      setOverrideTarget({ row, mode });
                      setOverrideReason("");
                      setOverrideError(null);
                      setNotice(null);
                    }}
                  />
                </td>
              </tr>
            ) : null}
            </Fragment>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={19} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No finished goods match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={8}>
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
          {summary && (summary.archivedExcluded > 0 || summary.unattributedLines > 0) ? (
            <tr className="bg-slate-50 text-[11px] font-semibold text-slate-600">
              <td className="px-3 py-2" colSpan={19}>
                Not included above:
                {summary.archivedExcluded > 0
                  ? ` ${summary.archivedExcluded} archived product${summary.archivedExcluded === 1 ? "" : "s"} (${formatMoney(summary.archivedRevenue)} sales in this period) — archived products are not assessed and are never counted at risk.`
                  : ""}
                {summary.unattributedLines > 0
                  ? ` ${summary.unattributedLines} invoice line${summary.unattributedLines === 1 ? "" : "s"} with no product (${formatMoney(summary.unattributedRevenue)}) cannot be attributed to any finished good.`
                  : ""}
              </td>
            </tr>
          ) : null}
        </tfoot>
      </ReportTable>
      {overrideTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:hidden" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">
              {overrideTarget.mode === "create" ? "Override BOM Completeness" : "Remove Override"}
            </h3>
            <p className="mt-1 text-sm font-bold text-slate-700">
              {overrideTarget.row.productName} {overrideTarget.row.productCode ? `(${overrideTarget.row.productCode})` : ""}
            </p>
            <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[12px] font-semibold text-slate-600">
              System classification: <b>{overrideTarget.row.bomStatus}</b> ({overrideTarget.row.severity}). {overrideTarget.row.classificationReason}
            </p>
            {overrideTarget.mode === "create" ? (
              <p className="mt-2 text-[12px] font-semibold leading-relaxed text-violet-900">
                The report will show this BOM as <b>Manually Overridden</b>, recording you, the date and time, the system
                classification above and your reason. The BOM, its lines, ingredients, costing and stock deduction are NOT
                changed, the exceptions stay visible, and its revenue stays in Revenue at Risk. If the BOM changes later, the
                override stops applying until it is reviewed again.
              </p>
            ) : (
              <p className="mt-2 text-[12px] font-semibold text-slate-700">
                Recorded by {overrideTarget.row.override?.createdBy} on {overrideTarget.row.override?.createdAt.slice(0, 16).replace("T", " ")}:
                “{overrideTarget.row.override?.reason}”. The removal is recorded in the audit trail.
              </p>
            )}
            <label className="mt-3 block">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                {overrideTarget.mode === "create" ? "Reason (mandatory, at least 10 characters)" : "Reason for removal (mandatory)"}
              </span>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
            {overrideError ? <p className="mt-2 text-[12px] font-bold text-rose-700">{overrideError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={overrideBusy || overrideReason.trim().length < (overrideTarget.mode === "create" ? 10 : 5)}
                onClick={submitOverride}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
              >
                {overrideBusy ? "Saving…" : overrideTarget.mode === "create" ? "Confirm Override" : "Remove Override"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ReportDocument>
  );
}

function BomExceptionDetail({
  row,
  canOverride,
  onOverride,
}: {
  row: BomCompletenessRow;
  canOverride: boolean;
  onOverride: (mode: "create" | "remove") => void;
}) {
  const affected = new Set(row.exceptions.flatMap((e) => e.lineIds));
  return (
    <div className="space-y-3 text-[12px] text-slate-700">
      <div className="grid gap-2 md:grid-cols-4">
        <Fact label="Finished Good" value={`${row.productName}${row.productCode ? ` — ${row.productCode}` : ""}`} />
        <Fact label="BOM Name" value={row.bomName ?? "No BOM resolved"} />
        <Fact label="BOM ID" value={row.bomId ?? "—"} />
        <Fact
          label="BOM Record Status"
          value={`${row.bomRecordStatus ?? "—"}${row.bomIsDraft ? " (Draft)" : ""}${row.bomIsArchived ? " (Archived)" : ""}${
            row.bomLink === "name"
              ? " · linked by name only"
              : row.bomLink === "linked"
                ? " · via product BOM link"
                : row.bomLink === "product"
                  ? " · owned by this product"
                  : ""
          }`}
        />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Why this classification</div>
        <p className="mt-1 font-semibold">{row.classificationReason}</p>
        {row.override ? (
          <p className="mt-2 rounded bg-violet-50 p-2 font-semibold text-violet-900">
            <b>Manually Overridden</b> by {row.override.createdBy} on {row.override.createdAt.slice(0, 16).replace("T", " ")} — original
            classification {row.override.originalStatus} ({row.override.originalSeverity}). Reason: “{row.override.reason}”. The exceptions
            below are unchanged: the override does not repair them.
          </p>
        ) : null}
        {row.staleOverride ? (
          <p className="mt-2 rounded bg-amber-50 p-2 font-semibold text-amber-900">
            An override by {row.staleOverride.createdBy} ({row.staleOverride.createdAt.slice(0, 10)}, “{row.staleOverride.reason}”) is NOT
            applied: {row.staleOverride.staleReason}
          </p>
        ) : null}
      </div>
      {row.exceptions.length ? (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Exceptions and what to correct</div>
          <ul className="mt-1 space-y-1.5">
            {row.exceptions.map((e) => (
              <li key={`${e.code}-${e.message}`} className="rounded-lg border border-slate-200 bg-white p-2">
                <span
                  className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                    e.drivesClassification ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {e.drivesClassification ? "Causes classification" : "Also noted"}
                </span>
                <span className="font-bold text-slate-900">{e.message}</span>
                <span className="mt-0.5 block font-semibold text-emerald-800">Correct by: {e.correction}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.lines.length ? (
        <div className="overflow-x-auto">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">BOM lines ({row.lines.length})</div>
          <table className="mt-1 w-full min-w-[980px] border border-slate-200 bg-white text-left text-[11px]">
            <thead className="bg-slate-100 font-black uppercase text-slate-600">
              <tr>
                <th className="px-2 py-1.5">Component / Description</th>
                <th className="px-2 py-1.5">Ingredient Reference</th>
                <th className="px-2 py-1.5">Ingredient Record</th>
                <th className="px-2 py-1.5 text-right">Required Qty</th>
                <th className="px-2 py-1.5">Unit</th>
                <th className="px-2 py-1.5 text-right">Unit Cost</th>
                <th className="px-2 py-1.5 text-right">Line Cost</th>
                <th className="px-2 py-1.5">Cost</th>
                <th className="px-2 py-1.5">Problem</th>
              </tr>
            </thead>
            <tbody>
              {row.lines.map((l) => (
                <tr key={l.lineId} className={`border-t border-slate-100 ${affected.has(l.lineId) || l.problems.length ? "bg-rose-50/60" : ""}`}>
                  <td className="px-2 py-1.5 font-bold text-slate-900">{l.lineName}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-slate-600">
                    {l.ingredientId ?? (l.childBomId ? `Sub-BOM ${l.childBomId}` : "—")}
                    {l.ingredientName && l.ingredientName !== l.lineName ? <span className="block font-sans">{l.ingredientName}</span> : null}
                  </td>
                  <td
                    className={`px-2 py-1.5 font-bold ${
                      l.ingredientState === "valid" || l.ingredientState === "sub-bom" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {INGREDIENT_STATE_LABEL[l.ingredientState]}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${l.zeroQuantity ? "font-black text-rose-700" : ""}`}>
                    {formatQty(l.quantity, 4)}
                  </td>
                  <td className="px-2 py-1.5">{l.unit ?? <span className="text-rose-700">No unit</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(l.unitCost)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(l.lineCost)}</td>
                  <td className={`px-2 py-1.5 ${l.costState === "zero" ? "font-bold text-amber-700" : ""}`}>{COST_STATE_LABEL[l.costState]}</td>
                  <td className="px-2 py-1.5 font-semibold text-rose-800">{l.problems.join(" ") || <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="font-semibold text-slate-500">
          {row.bomId ? "This BOM has no lines." : "No BOM is resolved, so there are no lines to show."}
        </p>
      )}
      <p className="text-[11px] font-semibold text-slate-500">
        Ingredient records carry no active/inactive flag in this system, so a component is reported as deleted (its record no longer
        exists), unlinked (text only) or linked — never as “inactive”.
      </p>
      {canOverride && row.bomStatus !== "COMPLETE" ? (
        <div className="flex gap-2 print:hidden">
          {row.override ? (
            <button
              type="button"
              onClick={() => onOverride("remove")}
              className="rounded-xl border border-violet-300 px-3 py-1.5 text-[12px] font-black text-violet-800"
            >
              Remove Override
            </button>
          ) : (
            <button type="button" onClick={() => onOverride("create")} className="rounded-xl bg-violet-700 px-3 py-1.5 text-[12px] font-black text-white">
              Override BOM Completeness
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-0.5 break-all font-bold text-slate-900">{value}</div>
    </div>
  );
}

