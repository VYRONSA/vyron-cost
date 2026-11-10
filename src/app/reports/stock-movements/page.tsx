import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { loadStockMovements } from "@/lib/vyron-reports-data";
import { isIsoDate, todaySast } from "@/lib/vyron-period-performance";

export const dynamic = "force-dynamic";

/**
 * Stock movements for a date range — every stock ledger row, newest first, with the item and the
 * document behind it. The drill-down target for the dashboard's "Stock movements this month".
 */
const TYPES = ["all", "finished_goods", "raw_materials"] as const;
type TypeFilter = (typeof TYPES)[number];
const TYPE_LABEL: Record<TypeFilter, string> = { all: "All items", finished_goods: "Finished goods", raw_materials: "Raw materials" };
const qty = (v: number) => (v ? Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 3 }) : "");
const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function referenceHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "production_run") return `/production-runs/${id}`;
  if (type === "customer_invoice") return `/customer-invoices/${id}`;
  if (type === "goods_receipt") return `/goods-receipts/${id}`;
  if (type === "stock_count") return `/inventory/counts/${id}`;
  return null;
}

export default async function StockMovementsReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; type?: string }> }) {
  const params = await searchParams;
  const today = todaySast();
  let from = isIsoDate(params.from) ? params.from : `${today.slice(0, 7)}-01`;
  let to = isIsoDate(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  const type: TypeFilter = (TYPES as readonly string[]).includes(String(params.type)) ? (params.type as TypeFilter) : "all";
  const load = await loadStockMovements({ from, to, type });
  const data = load.data;

  return (
    <VyronCostAiShell hidePageHeader title="Stock Movements" subtitle="Every stock ledger movement in a date range">
      <div className="space-y-6" data-testid="stock-movements-report">
        <header className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748B]">Reports</div>
          <h1 className="mt-1 text-2xl font-black text-[#0B202B]">Stock Movements</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#64748B]">Rows from the stock ledger dated in the range (South African time), newest first. Select an item to open its stock card, or a reference to open the document.</p>
          <form method="get" className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <label className="text-xs font-bold text-[#334155]">
              From
              <input type="date" name="from" defaultValue={from} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              To
              <input type="date" name="to" defaultValue={to} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold text-[#334155]">
              Items
              <select name="type" defaultValue={type} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm">
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-[#1F4757] px-5 py-2.5 text-sm font-bold text-white">Apply</button>
          </form>
        </header>
        {load.error || !data ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{load.error || "Report unavailable."}</div>
        ) : (
          <section className="rounded-[2rem] bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-black text-[#0B202B]">{data.total.toLocaleString("en-ZA")} movement(s) · {TYPE_LABEL[type]}</h2>
              <span className="text-xs font-semibold text-[#64748B]">
                {from} to {to}
                {data.total > data.rows.length ? ` · showing the latest ${data.rows.length}` : ""}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Item Code</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2">Movement</th>
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2 text-right">In</th>
                    <th className="px-2 py-2 text-right">Out</th>
                    <th className="px-2 py-2 text-right">Balance</th>
                    <th className="px-2 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={9} className="px-2 py-6 text-center text-[#64748B]">No stock movements in this range.</td></tr>
                  ) : (
                    data.rows.map((m) => {
                      const href = referenceHref(m.referenceType, m.referenceId);
                      return (
                        <tr key={m.id} className="border-t border-[#F1F5F9]">
                          <td className="px-2 py-1.5 text-[#64748B]">{m.date}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{m.itemCode}</td>
                          <td className="px-2 py-1.5"><Link className="font-semibold text-[#1F4757] hover:underline" href={`/inventory/stock/${m.stockItemId}`}>{m.description}</Link></td>
                          <td className="px-2 py-1.5">{m.movementType}</td>
                          <td className="px-2 py-1.5">{href ? <Link className="text-[#1F4757] hover:underline" href={href}>{m.referenceLabel || m.referenceType}</Link> : m.referenceLabel || m.referenceType || "—"}</td>
                          <td className="px-2 py-1.5 text-right">{qty(m.quantityIn)}</td>
                          <td className="px-2 py-1.5 text-right">{qty(m.quantityOut)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{Number(m.balanceAfter).toLocaleString("en-ZA", { maximumFractionDigits: 3 })}</td>
                          <td className="px-2 py-1.5 text-right">{money(m.value)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </VyronCostAiShell>
  );
}
