import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadPeriodPerformance } from "@/lib/vyron-reports-data";
import { isIsoDate, periodOf, todaySast, type Granularity } from "@/lib/vyron-period-performance";

export const dynamic = "force-dynamic";

/**
 * Sales, Purchases & Gross Profit — daily / weekly / monthly, Month-to-Date,
 * and the Top 10 fastest-moving products.
 *
 * Sales and GP are read from the existing GP engine (getCustomerGpReport) and
 * only grouped here, so every figure reconciles with the GP reports. Values are
 * excluding VAT. Selecting a period drills down to its invoices.
 */
const GRANULARITIES: Granularity[] = ["day", "week", "month"];
const LABEL: Record<Granularity, string> = { day: "Daily", week: "Weekly", month: "Monthly" };

const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const qty = (v: number) => Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 });

function change(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; by?: string; focus?: string }>;
}) {
  const params = await searchParams;
  const today = todaySast();
  const granularity: Granularity = (GRANULARITIES as string[]).includes(String(params.by)) ? (params.by as Granularity) : "day";
  const defaultFrom = `${today.slice(0, 7)}-01`;
  let from = isIsoDate(params.from) ? params.from : defaultFrom;
  let to = isIsoDate(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];

  const load = await loadPeriodPerformance({ from, to, granularity, today });
  const data = load.data;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ from, to, by: granularity, ...extra }).toString();
  const focus = data?.buckets.find((b) => b.key === params.focus) || null;

  return (
    <VyronCostAiShell hidePageHeader title="Sales, Purchases & GP" subtitle="Daily · Weekly · Monthly · Month-to-Date · Fastest movers">
      <div className="space-y-6" data-testid="performance-report">
        <header className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748B]">Reports</div>
          <h1 className="mt-1 text-2xl font-black text-[#0B202B]">Sales, Purchases &amp; Gross Profit</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
            Sales and GP come from issued customer invoices only (Posted, Sent, Paid or stock posted); Draft and Cancelled are excluded. Purchases are supplier invoices excluding Draft and Cancelled.
            All values exclude VAT. GP uses the same calculation as the GP reports.
          </p>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-[#334155]">
              From
              <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              To
              <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              Group by
              <select name="by" defaultValue={granularity} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm">
                {GRANULARITIES.map((g) => (
                  <option key={g} value={g}>{LABEL[g]}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-[#1F4757] px-5 py-2.5 text-sm font-bold text-white">Apply</button>
          </form>
        </header>

        {load.error || !data ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{load.error || "Report unavailable."}</div>
        ) : (
          <>
            <section data-testid="mtd" className="rounded-[2rem] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-[#0B202B]">Month-to-Date</h2>
                <span className="text-xs font-semibold text-[#64748B]">
                  {data.mtd.current.from} to {data.mtd.current.to}, compared with {data.mtd.previous.from} to {data.mtd.previous.to}
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Sales MTD", data.mtd.current.sales, data.mtd.previous.sales, money],
                  ["Purchases MTD", data.mtd.current.purchases, data.mtd.previous.purchases, money],
                  ["Gross Profit MTD", data.mtd.current.grossProfit, data.mtd.previous.grossProfit, money],
                  ["GP % MTD", data.mtd.current.gpPct, data.mtd.previous.gpPct, pct],
                ].map(([label, cur, prev, fmt]) => {
                  const c = label === "GP % MTD" ? null : change(cur as number, prev as number);
                  return (
                    <div key={label as string} className="rounded-2xl border border-[#E2E8F0] p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">{label as string}</div>
                      <div className="mt-1 text-2xl font-black text-[#0B202B]">{(fmt as (v: number) => string)(cur as number)}</div>
                      <div className="mt-1 text-xs font-semibold text-[#64748B]">
                        Same days last month {(fmt as (v: number) => string)(prev as number)}
                        {c === null ? "" : ` · ${c >= 0 ? "+" : ""}${c.toFixed(1)}%`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-[#0B202B]">{LABEL[granularity]} figures</h2>
                <span className="text-xs font-semibold text-[#64748B]">{from} to {to} · select a period to see its invoices</span>
              </div>
              {data.costWarnings && data.costWarnings.linesWithoutCost > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
                  {data.costWarnings.linesWithoutCost} sold line(s) worth {money(data.costWarnings.revenueWithoutCost)} have no recorded cost, so GP for those lines is overstated.
                </div>
              ) : null}
              {data.purchasesWithoutSubtotal > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
                  {data.purchasesWithoutSubtotal} supplier invoice(s) in this range have no ex-VAT subtotal recorded and are counted as R0.
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm" data-testid="period-table">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2 text-right">Sales</th>
                      <th className="px-3 py-2 text-right">Cost of sales</th>
                      <th className="px-3 py-2 text-right">Gross profit</th>
                      <th className="px-3 py-2 text-right">GP %</th>
                      <th className="px-3 py-2 text-right">Purchases</th>
                      <th className="px-3 py-2 text-right">Invoices (sales / purchases)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buckets.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-[#64748B]">No sales or purchases in this range.</td></tr>
                    ) : (
                      data.buckets.map((b) => (
                        <tr key={b.key} className={`border-t border-[#F1F5F9] ${focus?.key === b.key ? "bg-[#EEF3F5]" : ""}`}>
                          <td className="px-3 py-2 font-semibold">
                            <Link className="text-[#1F4757] underline-offset-2 hover:underline" href={`/reports/performance?${qs({ focus: b.key })}#drilldown`}>{b.label}</Link>
                          </td>
                          <td className="px-3 py-2 text-right">{money(b.sales)}</td>
                          <td className="px-3 py-2 text-right">{money(b.costOfSales)}</td>
                          <td className={`px-3 py-2 text-right font-bold ${b.grossProfit < 0 ? "text-rose-700" : ""}`}>{money(b.grossProfit)}</td>
                          <td className="px-3 py-2 text-right">{pct(b.gpPct)}</td>
                          <td className="px-3 py-2 text-right">{money(b.purchases)}</td>
                          <td className="px-3 py-2 text-right text-[#64748B]">{b.salesInvoices} / {b.purchaseInvoices}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#CBD5E1] font-black">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{money(data.totals.sales)}</td>
                      <td className="px-3 py-2 text-right">{money(data.totals.costOfSales)}</td>
                      <td className="px-3 py-2 text-right">{money(data.totals.grossProfit)}</td>
                      <td className="px-3 py-2 text-right">{pct(data.totals.gpPct)}</td>
                      <td className="px-3 py-2 text-right">{money(data.totals.purchases)}</td>
                      <td className="px-3 py-2 text-right text-[#64748B]">{data.totals.salesInvoices} / {data.totals.purchaseInvoices}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {focus ? (
              <section id="drilldown" data-testid="drilldown" className="rounded-[2rem] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-black text-[#0B202B]">{focus.label}: supporting invoices</h2>
                  <Link className="text-xs font-bold text-[#1F4757]" href={`/reports/performance?${qs({})}`}>Close</Link>
                </div>
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <div className="overflow-x-auto">
                    <h3 className="mb-2 text-sm font-black text-[#334155]">Customer invoices ({focus.salesInvoices})</h3>
                    <table className="w-full min-w-[420px] text-sm">
                      <thead><tr className="text-left text-[11px] uppercase text-[#64748B]"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Invoice</th><th className="px-2 py-1">Customer</th><th className="px-2 py-1 text-right">Sales</th><th className="px-2 py-1 text-right">GP</th></tr></thead>
                      <tbody>
                        {data.salesInvoices
                          .filter((i) => { const d = String(i.invoiceDate).slice(0, 10); return periodOf(d, granularity).key === focus.key && d >= from && d <= to; })
                          .map((i) => (
                            <tr key={i.invoiceId} className="border-t border-[#F1F5F9]">
                              <td className="px-2 py-1 text-[#64748B]">{String(i.invoiceDate).slice(0, 10)}</td>
                              <td className="px-2 py-1"><Link className="font-semibold text-[#1F4757] hover:underline" href={`/customer-invoices/${i.invoiceId}`}>{i.invoiceNumber}</Link></td>
                              <td className="px-2 py-1">{i.customerName}</td>
                              <td className="px-2 py-1 text-right">{money(i.revenue)}</td>
                              <td className="px-2 py-1 text-right">{money(i.gp)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto">
                    <h3 className="mb-2 text-sm font-black text-[#334155]">Supplier invoices ({focus.purchaseInvoices})</h3>
                    <table className="w-full min-w-[420px] text-sm">
                      <thead><tr className="text-left text-[11px] uppercase text-[#64748B]"><th className="px-2 py-1">Date</th><th className="px-2 py-1">Invoice</th><th className="px-2 py-1">Supplier</th><th className="px-2 py-1 text-right">Excl. VAT</th></tr></thead>
                      <tbody>
                        {data.purchaseInvoices
                          .filter((p) => periodOf(String(p.invoiceDate).slice(0, 10), granularity).key === focus.key)
                          .map((p) => (
                            <tr key={p.id} className="border-t border-[#F1F5F9]">
                              <td className="px-2 py-1 text-[#64748B]">{String(p.invoiceDate).slice(0, 10)}</td>
                              <td className="px-2 py-1"><Link className="font-semibold text-[#1F4757] hover:underline" href={p.href}>{p.invoiceNumber}</Link></td>
                              <td className="px-2 py-1">{p.supplierName}</td>
                              <td className="px-2 py-1 text-right">{p.subtotal === null ? "not recorded" : money(p.subtotal)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            <section id="fastest-movers" data-testid="fastest-movers" className="rounded-[2rem] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-[#0B202B]">Top 10 fastest-moving products</h2>
                <span className="text-xs font-semibold text-[#64748B]">{from} to {to}</span>
              </div>
              <p className="mt-1 text-xs text-[#64748B]">
                Ranked by units sold on issued customer invoices in the date range (Draft and Cancelled excluded). Ties are ranked by sales value.
                Purchases, production and stock adjustments are never counted as sales.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Item Code</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Units sold</th>
                      <th className="px-3 py-2 text-right">Sales value (excl. VAT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fastMovers.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-[#64748B]">No products sold in this range.</td></tr>
                    ) : (
                      data.fastMovers.map((m) => (
                        <tr key={`${m.rank}-${m.productId}`} className="border-t border-[#F1F5F9]">
                          <td className="px-3 py-2 font-black">{m.rank}</td>
                          <td className="px-3 py-2 font-mono text-xs">{m.itemCode}</td>
                          <td className="px-3 py-2">{m.description}</td>
                          <td className="px-3 py-2 text-right font-bold">{qty(m.unitsSold)}</td>
                          <td className="px-3 py-2 text-right">{money(m.salesValue)}</td>
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
