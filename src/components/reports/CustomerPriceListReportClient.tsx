"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import type { ReportFilter } from "@/lib/vyron-report-exports";
import type { PriceListReport } from "@/lib/vyron-customer-sales-reports";

/**
 * Customer Price List Report.
 *
 * "What price is this customer entitled to for each product?" Every row and
 * every entitlement comes from /api/reports/customer-price-list, which applies
 * the same rule the Customer Order catalogue enforces. Nothing about pricing is
 * worked out in the browser: this component only chooses filters and shows the
 * answer.
 */

type Filters = {
  customerId: string;
  priceListId: string;
  productId: string;
  search: string;
  status: string;
  asOf: string;
  effectiveFrom: string;
  effectiveTo: string;
};

const STATUS_LABEL: Record<string, string> = {
  entitled: "Entitled today",
  active: "All active",
  inactive: "Inactive / removed",
  all: "All",
};

const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CustomerPriceListReportClient({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  const { canExport } = useReportsPermissions();
  const [filters, setFilters] = useState<Filters>({
    customerId: "",
    priceListId: "",
    productId: "",
    search: "",
    status: "entitled",
    asOf: generatedAt.slice(0, 10),
    effectiveFrom: "",
    effectiveTo: "",
  });
  const [report, setReport] = useState<PriceListReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
      const res = await fetch(`/api/reports/customer-price-list?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The report could not be loaded.");
      setReport(data.report as PriceListReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filters are applied on the server; typing in search waits for a pause.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), filters.search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  const set = (key: keyof Filters) => (value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const nameOf = (list: Array<{ id: string; name: string }> | undefined, id: string) => list?.find((o) => o.id === id)?.name || id;

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [{ key: "status", label: "Showing", value: STATUS_LABEL[filters.status] || filters.status }];
    list.push({ key: "asOf", label: "Entitlement as at", value: filters.asOf || "Today" });
    if (filters.customerId) list.push({ key: "customer", label: "Customer", value: nameOf(report?.options.customers, filters.customerId) });
    if (filters.priceListId) list.push({ key: "priceList", label: "Price list", value: nameOf(report?.options.priceLists, filters.priceListId) });
    if (filters.productId) list.push({ key: "product", label: "Product", value: nameOf(report?.options.products, filters.productId) });
    if (filters.search.trim()) list.push({ key: "search", label: "Search", value: filters.search.trim() });
    if (filters.effectiveFrom || filters.effectiveTo) list.push({ key: "effective", label: "Effective", value: `${filters.effectiveFrom || "…"} to ${filters.effectiveTo || "…"}` });
    return list;
  }, [filters, report]);

  const rows = useMemo(() => report?.rows ?? [], [report]);
  const summary = useMemo(
    () => [
      { label: "Customers With A Price List", value: String(report?.summary.customersWithPriceList ?? 0) },
      { label: "Entitled Product Prices", value: String(report?.summary.entitledProductPrices ?? 0) },
      { label: "Price Lists", value: String(report?.summary.priceLists ?? 0) },
      { label: "Active Customers Without A List", value: String(report?.summary.activeCustomersWithoutPriceList ?? 0) },
    ],
    [report]
  );

  const period = useMemo(() => ({ kind: "asAt" as const, date: report?.asOf || filters.asOf || generatedAt.slice(0, 10) }), [report, filters.asOf, generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "customer-price-list",
        title: "Customer Price List Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary,
        columns: [
          { key: "customer", label: "Customer" },
          { key: "code", label: "Customer Code" },
          { key: "list", label: "Price List" },
          { key: "role", label: "Role" },
          { key: "version", label: "Version" },
          { key: "product", label: "Product" },
          { key: "sku", label: "SKU" },
          { key: "price", label: "List Price" },
          { key: "from", label: "Effective From" },
          { key: "to", label: "Effective To" },
          { key: "status", label: "Status" },
          { key: "entitled", label: "Entitled" },
          { key: "note", label: "Note" },
        ],
        rows: rows.map((r) => [
          r.customerName,
          r.customerCode || "",
          r.priceListName,
          r.role,
          String(r.version),
          r.productName,
          r.sku || "",
          r.listPrice.toFixed(2),
          r.effectiveFrom || "",
          r.effectiveTo || "",
          r.itemStatus,
          r.entitled ? "Yes" : "No",
          r.note || "",
        ]),
      }),
    [rows, summary, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";
  const labelClass = "text-[10px] font-black uppercase tracking-[0.14em] text-slate-500";

  return (
    <ReportDocument
      reportKey="customer-price-list"
      title="Customer Price List Report"
      subtitle="The price each customer is entitled to for each product, from their assigned price lists."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      summary={summary}
      onRefresh={() => void load(filters)}
      refreshing={loading}
      getExportPayload={canExport ? getExportPayload : undefined}
      error={error}
      isEmpty={!loading && !error && rows.length === 0}
      emptyMessage="No customer price-list entries match these filters."
      controls={
        <>
          <label className="min-w-[200px]">
            <span className={labelClass}>Customer</span>
            <select value={filters.customerId} onChange={(e) => set("customerId")(e.target.value)} className={controlClass}>
              <option value="">All customers</option>
              {(report?.options.customers ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px]">
            <span className={labelClass}>Price list</span>
            <select value={filters.priceListId} onChange={(e) => set("priceListId")(e.target.value)} className={controlClass}>
              <option value="">All price lists</option>
              {(report?.options.priceLists ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px]">
            <span className={labelClass}>Product</span>
            <select value={filters.productId} onChange={(e) => set("productId")(e.target.value)} className={controlClass}>
              <option value="">All products</option>
              {(report?.options.products ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px]">
            <span className={labelClass}>Search</span>
            <input value={filters.search} onChange={(e) => set("search")(e.target.value)} placeholder="Product, SKU, customer…" className={controlClass} />
          </label>
          <label className="min-w-[160px]">
            <span className={labelClass}>Status</span>
            <select value={filters.status} onChange={(e) => set("status")(e.target.value)} className={controlClass}>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Entitlement as at</span>
            <input type="date" value={filters.asOf} onChange={(e) => set("asOf")(e.target.value)} className={controlClass} />
          </label>
          <label>
            <span className={labelClass}>Effective from</span>
            <input type="date" value={filters.effectiveFrom} onChange={(e) => set("effectiveFrom")(e.target.value)} className={controlClass} />
          </label>
          <label>
            <span className={labelClass}>Effective to</span>
            <input type="date" value={filters.effectiveTo} onChange={(e) => set("effectiveTo")(e.target.value)} className={controlClass} />
          </label>
        </>
      }
    >
      {/* Fits the 1440px desktop content area; narrower screens scroll the table, not the page. */}
      <ReportTable minWidth={920}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5">Price List</th>
            <th className="px-3 py-2.5">Product</th>
            <th className="px-3 py-2.5">SKU</th>
            <th className="px-3 py-2.5 text-right">List Price</th>
            <th className="px-3 py-2.5">Effective</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Entitled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.customerId}-${r.priceListId}-${r.productId}`} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2">
                <div className="font-black text-slate-900">{r.customerName}</div>
                {r.customerCode ? <div className="text-xs text-slate-500">{r.customerCode}</div> : null}
              </td>
              <td className="px-3 py-2">
                <div className="font-semibold text-slate-900">{r.priceListName}</div>
                <div className="text-xs text-slate-500">{r.role} · {r.listType} · v{r.version}{r.listStatus !== "Active" ? ` · ${r.listStatus}` : ""}</div>
              </td>
              <td className="px-3 py-2 font-semibold text-slate-900">{r.productName}</td>
              <td className="px-3 py-2 text-slate-700">{r.sku || "-"}</td>
              <td className="px-3 py-2 text-right font-black tabular-nums text-slate-900">{money(r.listPrice)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">
                {r.effectiveFrom || r.effectiveTo ? `${r.effectiveFrom || "…"} – ${r.effectiveTo || "open"}` : "Always"}
              </td>
              <td className="px-3 py-2 text-slate-700">{r.itemStatus === "Active" ? "Active" : "Removed"}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded-2xl px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                    r.entitled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {r.entitled ? "Yes" : r.note || "No"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
    </ReportDocument>
  );
}
