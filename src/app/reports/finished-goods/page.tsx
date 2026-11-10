import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadFinishedGoodsDashboard } from "@/lib/vyron-reports-data";
import { isIsoDate, todaySast } from "@/lib/vyron-period-performance";
import type { FgRow } from "@/lib/vyron-finished-goods-dashboard";

export const dynamic = "force-dynamic";

/**
 * Finished Goods dashboard — stock on hand, value, period movements and
 * production, with drill-down to the ledger rows behind every figure.
 *
 * Reads the existing finished-goods stock items, stock ledger and production
 * runs for the active workspace company. Opening/closing balances are the
 * ledger's recorded balance_after; nothing is estimated.
 */
const qty = (v: number | null) => (v === null ? "—" : Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 3 }));
const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VIEWS = ["all", "in_stock", "below_min", "out", "moved"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = {
  all: "All",
  in_stock: "In stock",
  below_min: "Below minimum",
  out: "Zero or negative",
  moved: "Moved in range",
};

function referenceHref(type: string | null, id: string | null, label: string | null) {
  if (!type) return null;
  if (type === "production_run" && id) return `/production-runs/${id}`;
  if ((type === "customer_invoice" || type === "Customer Invoice") && (id || label)) return `/customer-invoices/${encodeURIComponent(id || label || "")}`;
  if (type === "goods_receipt" && id) return `/goods-receipts/${id}`;
  if (type === "stock_count" && id) return `/inventory/counts/${id}`;
  return null;
}

function matchesView(r: FgRow, view: View) {
  if (view === "in_stock") return r.qtyOnHand > 0;
  if (view === "below_min") return r.belowMinimum;
  if (view === "out") return r.qtyOnHand <= 0;
  if (view === "moved") return r.movementCount > 0;
  return true;
}

export default async function FinishedGoodsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; view?: string; focus?: string }>;
}) {
  const params = await searchParams;
  const today = todaySast();
  let from = isIsoDate(params.from) ? params.from : `${today.slice(0, 7)}-01`;
  let to = isIsoDate(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const view: View = (VIEWS as readonly string[]).includes(String(params.view)) ? (params.view as View) : "all";
  const search = String(params.q || "").trim();
  const focusId = params.focus && /^[0-9a-f-]{36}$/i.test(params.focus) ? params.focus : null;

  const load = await loadFinishedGoodsDashboard({ from, to, focusId });
  const data = load.data;
  const qs = (extra: Record<string, string>) => {
    const base: Record<string, string> = { from, to, view };
    if (search) base.q = search;
    return new URLSearchParams({ ...base, ...extra }).toString();
  };
  const term = search.toLowerCase();
  const rows = (data?.rows || []).filter(
    (r) => matchesView(r, view) && (!term || `${r.itemCode} ${r.description} ${r.category}`.toLowerCase().includes(term))
  );

  return (
    <VyronCostAiShell hidePageHeader title="Finished Goods Dashboard" subtitle="Stock · Movements · Production">
      <div className="space-y-6" data-testid="fg-dashboard">
        <header className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748B]">Reports</div>
          <h1 className="mt-1 text-2xl font-black text-[#0B202B]">Finished Goods Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
            Quantities on hand and values are the stock master. Period figures are the stock ledger for the selected dates; opening and closing are the
            balances the ledger recorded. Select a product to see every movement behind its figures.
          </p>
          <form method="get" className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <label className="text-xs font-bold text-[#334155]">
              From
              <input type="date" name="from" defaultValue={from} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              To
              <input type="date" name="to" defaultValue={to} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="col-span-2 text-xs font-bold text-[#334155] sm:col-span-1">
              Item Code or description
              <input type="search" name="q" defaultValue={search} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm sm:w-64" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              Show
              <select name="view" defaultValue={view} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm">
                {VIEWS.map((v) => (
                  <option key={v} value={v}>{VIEW_LABEL[v]}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-[#1F4757] px-5 py-2.5 text-sm font-bold text-white">Apply</button>
          </form>
        </header>

        {load.error || !data ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{load.error || "Dashboard unavailable."}</div>
        ) : (
          <>
            <section data-testid="fg-kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Finished goods", `${data.totals.items}`, `${data.totals.activeItems} active`, "all"],
                ["Units on hand", qty(data.totals.qtyOnHand), `${data.totals.negative} negative`, "in_stock"],
                ["Stock value", money(data.totals.stockValue), "stock master valuation", "in_stock"],
                ["Below minimum", `${data.totals.belowMinimum}`, `${data.totals.outOfStock} at zero`, "below_min"],
                ["Produced in range", qty(data.totals.producedQty), `${data.production.completedRuns} completed run(s)`, "moved"],
                ["Sold / dispatched in range", qty(data.totals.soldQty), "from stock ledger", "moved"],
                ["Movements in range", `${data.totals.movementCount}`, `${from} to ${to}`, "moved"],
                ["Production runs in range", `${data.production.runs}`, `planned ${qty(data.production.plannedQty)} · actual ${qty(data.production.actualQty)}`, ""],
              ].map(([label, value, sub, target]) => (
                <Link
                  key={label}
                  href={target ? `/reports/finished-goods?${qs({ view: target })}#fg-table` : `/reports/finished-goods?${qs({})}#fg-production`}
                  className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm hover:border-[#1F4757]"
                >
                  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
                  <div className="mt-1 text-xl font-black text-[#0B202B] sm:text-2xl">{value}</div>
                  <div className="mt-1 text-xs font-semibold text-[#64748B]">{sub}</div>
                </Link>
              ))}
            </section>

            {data.totals.itemsWithoutLedger > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
                {data.totals.itemsWithoutLedger} finished good(s) have no stock ledger history up to {to}; their opening and closing balances show as “—”.
              </div>
            ) : null}

            {data.focus ? (
              <section id="fg-movements" data-testid="fg-drilldown" className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-black text-[#0B202B]">
                    <span className="font-mono text-sm">{data.focus.row.itemCode}</span> · {data.focus.row.description}
                  </h2>
                  <div className="flex gap-3 text-xs font-bold">
                    <Link className="text-[#1F4757]" href={`/inventory/stock/${data.focus.row.id}`}>Stock item</Link>
                    <Link className="text-[#1F4757]" href={`/reports/finished-goods?${qs({})}#fg-table`}>Close</Link>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div>Opening <b>{qty(data.focus.row.openingQty)}</b></div>
                  <div>In <b>{qty(data.focus.row.totalInQty)}</b></div>
                  <div>Out <b>{qty(data.focus.row.totalOutQty)}</b></div>
                  <div>Closing <b>{qty(data.focus.row.closingQty)}</b></div>
                  <div>On hand now <b>{qty(data.focus.row.qtyOnHand)}</b> {data.focus.row.unit}</div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Movement</th>
                        <th className="px-2 py-2">Reference</th>
                        <th className="px-2 py-2 text-right">In</th>
                        <th className="px-2 py-2 text-right">Out</th>
                        <th className="px-2 py-2 text-right">Balance</th>
                        <th className="px-2 py-2 text-right">Value</th>
                        <th className="px-2 py-2">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.focus.movements.length === 0 ? (
                        <tr><td colSpan={8} className="px-2 py-6 text-center text-[#64748B]">No movements between {from} and {to}.</td></tr>
                      ) : (
                        data.focus.movements.map((m) => {
                          const href = referenceHref(m.referenceType, m.referenceId, m.referenceLabel);
                          return (
                            <tr key={m.id} className="border-t border-[#F1F5F9]">
                              <td className="px-2 py-1.5 text-[#64748B]">{m.movementDate}</td>
                              <td className="px-2 py-1.5 font-semibold">{m.movementType}</td>
                              <td className="px-2 py-1.5">
                                {href ? <Link className="text-[#1F4757] hover:underline" href={href}>{m.referenceLabel || m.referenceType}</Link> : m.referenceLabel || m.referenceType || "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right">{m.quantityIn ? qty(m.quantityIn) : ""}</td>
                              <td className="px-2 py-1.5 text-right">{m.quantityOut ? qty(m.quantityOut) : ""}</td>
                              <td className="px-2 py-1.5 text-right font-bold">{qty(m.balanceAfter)}</td>
                              <td className="px-2 py-1.5 text-right">{money(m.value)}</td>
                              <td className="px-2 py-1.5 text-[#64748B]">{m.actor || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section id="fg-table" className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-[#0B202B]">Finished goods · {VIEW_LABEL[view]} ({rows.length})</h2>
                <span className="text-xs font-semibold text-[#64748B]">{from} to {to}</span>
              </div>

              {/* Mobile: cards */}
              <div className="mt-4 space-y-2 sm:hidden" data-testid="fg-cards">
                {rows.map((r) => (
                  <Link key={r.id} href={`/reports/finished-goods?${qs({ focus: r.id })}#fg-movements`} className="block rounded-xl border border-[#E2E8F0] p-3">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-xs text-[#64748B]">{r.itemCode}</span>
                      {r.belowMinimum ? <span className="text-[10px] font-black uppercase text-rose-700">Below min</span> : null}
                    </div>
                    <div className="font-bold text-[#0B202B]">{r.description}</div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-[#334155]">
                      <span>On hand <b>{qty(r.qtyOnHand)}</b></span>
                      <span>In <b>{qty(r.totalInQty)}</b></span>
                      <span>Out <b>{qty(r.totalOutQty)}</b></span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1100px] text-sm" data-testid="fg-table">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                      <th className="px-2 py-2">Item Code</th>
                      <th className="px-2 py-2">Description</th>
                      <th className="px-2 py-2">Unit</th>
                      <th className="px-2 py-2 text-right">Opening</th>
                      <th className="px-2 py-2 text-right">Produced</th>
                      <th className="px-2 py-2 text-right">Sold</th>
                      <th className="px-2 py-2 text-right">Adj. in / out</th>
                      <th className="px-2 py-2 text-right">Other in / out</th>
                      <th className="px-2 py-2 text-right">Closing</th>
                      <th className="px-2 py-2 text-right">On hand now</th>
                      <th className="px-2 py-2 text-right">Minimum</th>
                      <th className="px-2 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={12} className="px-2 py-6 text-center text-[#64748B]">No finished goods match.</td></tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id} className={`border-t border-[#F1F5F9] ${data.focus?.row.id === r.id ? "bg-[#EEF3F5]" : ""}`}>
                          <td className="px-2 py-1.5 font-mono text-xs">{r.itemCode}</td>
                          <td className="px-2 py-1.5">
                            <Link className="font-semibold text-[#1F4757] hover:underline" href={`/reports/finished-goods?${qs({ focus: r.id })}#fg-movements`}>{r.description}</Link>
                            {r.isActive ? null : <span className="ml-1 text-[10px] font-bold uppercase text-[#94A3B8]">inactive</span>}
                          </td>
                          <td className="px-2 py-1.5 text-[#64748B]">{r.unit}</td>
                          <td className="px-2 py-1.5 text-right">{qty(r.openingQty)}</td>
                          <td className="px-2 py-1.5 text-right">{r.producedQty ? qty(r.producedQty) : ""}</td>
                          <td className="px-2 py-1.5 text-right">{r.soldQty ? qty(r.soldQty) : ""}</td>
                          <td className="px-2 py-1.5 text-right">{r.adjustmentInQty || r.adjustmentOutQty ? `${qty(r.adjustmentInQty)} / ${qty(r.adjustmentOutQty)}` : ""}</td>
                          <td className="px-2 py-1.5 text-right">{r.otherInQty || r.otherOutQty ? `${qty(r.otherInQty)} / ${qty(r.otherOutQty)}` : ""}</td>
                          <td className="px-2 py-1.5 text-right">{qty(r.closingQty)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${r.qtyOnHand < 0 ? "text-rose-700" : ""}`}>{qty(r.qtyOnHand)}</td>
                          <td className={`px-2 py-1.5 text-right ${r.belowMinimum ? "font-bold text-rose-700" : "text-[#64748B]"}`}>{r.minLevel ? qty(r.minLevel) : "—"}</td>
                          <td className="px-2 py-1.5 text-right">{money(r.stockValue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="fg-production" data-testid="fg-production" className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-[#0B202B]">
                  Production runs {data.focus ? `· ${data.focus.row.description}` : ""} ({data.runsInRange.length})
                </h2>
                <span className="text-xs font-semibold text-[#64748B]">
                  {Object.entries(data.production.byStatus).map(([s, n]) => `${s} ${n}`).join(" · ") || "none in range"}
                </span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Run</th>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Planned</th>
                      <th className="px-2 py-2 text-right">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runsInRange.length === 0 ? (
                      <tr><td colSpan={6} className="px-2 py-6 text-center text-[#64748B]">No production runs between {from} and {to}.</td></tr>
                    ) : (
                      data.runsInRange.slice(0, 300).map((run) => (
                        <tr key={run.id} className="border-t border-[#F1F5F9]">
                          <td className="px-2 py-1.5 text-[#64748B]">{run.date}</td>
                          <td className="px-2 py-1.5"><Link className="font-semibold text-[#1F4757] hover:underline" href={`/production-runs/${run.id}`}>{run.runNumber}</Link></td>
                          <td className="px-2 py-1.5">{run.productName}</td>
                          <td className="px-2 py-1.5">{run.status}</td>
                          <td className="px-2 py-1.5 text-right">{qty(run.plannedQty)}</td>
                          <td className="px-2 py-1.5 text-right">{qty(run.actualQty)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </VyronCostAiShell>
  );
}
