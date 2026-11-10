"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  productId: string;
  itemCode: string;
  description: string;
  status: string;
  lastSaleDate: string | null;
  lastMovementAt: string | null;
  lastActivity: string | null;
  daysSinceActivity: number | null;
  qtyOnHand: number;
  dormant: boolean;
};

const WINDOWS = [60, 90, 180, 365];

export default function DormantProductsClient() {
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [onlyDormant, setOnlyDormant] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/dormant?days=${days}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "Could not load products.");
      setRows(body.rows as Row[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [days, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(row: Row, action: "archive" | "delete") {
    const verb = action === "delete" ? "permanently delete" : "deactivate (archive)";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${row.itemCode} ${row.description}?${action === "delete" ? "\n\nDeletion is refused if any invoice, order, BOM, stock movement or production run uses this product." : ""}`)) return;
    setBusy(row.productId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/products/dormant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: row.productId, action, days }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.message || body.error || "Action refused.");
        return;
      }
      setMessage(`${row.itemCode} ${row.description} ${body.mode === "deleted" ? "deleted" : "deactivated (archived)"}.`);
      await load();
    } catch {
      setError("Action failed.");
    } finally {
      setBusy(null);
    }
  }

  const shown = rows.filter((r) => !onlyDormant || r.dormant);
  const dormantCount = rows.filter((r) => r.dormant).length;

  return (
    <div className="space-y-5" data-testid="dormant-products">
      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-[#0B202B]">Dormant Products</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
          A product is dormant when it has no issued sale and no finished-goods stock movement in the chosen period. Deactivating archives it and keeps all invoices, orders and stock history.
          Permanent deletion is only allowed for a product that nothing has ever used.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
          }}
        >
          <label className="text-xs font-bold text-[#334155]">
            Item Code or description
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. FG-ECD3E1BD or Apple Puff" className="mt-1 block w-72 max-w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-[#334155]">
            No activity for
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm">
              {WINDOWS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-xl bg-[#1F4757] px-5 py-2.5 text-sm font-bold text-white">Search</button>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#334155]">
            <input type="checkbox" checked={onlyDormant} onChange={(e) => setOnlyDormant(e.target.checked)} /> Dormant only ({dormantCount})
          </label>
        </form>
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div> : null}
      {message ? <div className="rounded-xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">{message}</div> : null}

      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        {loading ? (
          <div className="text-sm text-[#64748B]">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="text-sm text-[#64748B]">{onlyDormant ? "No dormant products for this search and period." : "No products match this search."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B]">
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last sale</th>
                  <th className="px-3 py-2">Last stock movement</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.productId} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2 font-mono text-xs">{r.itemCode}</td>
                    <td className="px-3 py-2 font-semibold text-[#0B202B]">
                      {r.description}
                      {r.dormant ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">Dormant</span> : null}
                    </td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2 text-[#64748B]">{r.lastSaleDate || "Never"}</td>
                    <td className="px-3 py-2 text-[#64748B]">{r.lastMovementAt || "Never"}</td>
                    <td className="px-3 py-2 text-right">{r.qtyOnHand}</td>
                    <td className="px-3 py-2">
                      {r.dormant ? (
                        r.qtyOnHand !== 0 ? (
                          <span className="text-xs font-semibold text-[#64748B]">Clear stock first</span>
                        ) : (
                          <div className="flex gap-2">
                            <button type="button" disabled={busy === r.productId} onClick={() => void act(r, "archive")} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold text-[#1F4757] disabled:opacity-50">
                              Deactivate
                            </button>
                            {!r.lastSaleDate && !r.lastMovementAt ? (
                              <button type="button" disabled={busy === r.productId} onClick={() => void act(r, "delete")} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">
                                Delete
                              </button>
                            ) : null}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-[#94A3B8]">Active within {days} days</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
