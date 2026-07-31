"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  priceMovementClass,
  priceMovementLabel,
  type PriceHistoryScope,
  type PriceMovement,
} from "@/lib/vyron-price-history";

type HistoryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  entity_type: string;
  entity_name: string | null;
  item_description: string | null;
  previous_price: number | null;
  new_price: number | null;
  price_difference: number | null;
  percentage_change: number | null;
  price_movement: PriceMovement | null;
  approved_at: string | null;
  created_at: string;
  document_id: string | null;
};

const SCOPE_LABELS: Record<PriceHistoryScope, string> = {
  all: "All price history",
  supplier: "Supplier price history",
  ingredient: "Ingredient price history",
  packaging: "Packaging price history",
  product: "Product cost history",
};

export default function PriceHistoryScreen({ scope }: { scope: PriceHistoryScope }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplier, setSupplier] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope });
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (supplier.trim()) params.set("supplier", supplier.trim());
      const res = await fetch(`/api/documents/price-history?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load price history.");
      setRows(json.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load price history.");
    } finally {
      setLoading(false);
    }
  }, [scope, search, dateFrom, dateTo, supplier]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = SCOPE_LABELS[scope];

  const hubLinks = useMemo(
    () =>
      [
        { href: "/document-intelligence/price-history/supplier", label: "Supplier", active: scope === "supplier" },
        { href: "/document-intelligence/price-history/ingredient", label: "Ingredient", active: scope === "ingredient" },
        { href: "/document-intelligence/price-history/packaging", label: "Packaging", active: scope === "packaging" },
        { href: "/document-intelligence/price-history/product", label: "Product", active: scope === "product" },
      ] as const,
    [scope]
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/document-intelligence"
          className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700 hover:text-violet-900"
        >
          ← Back
          Document Intelligence
        </Link>
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Permanent price records from approved invoices. History is never deleted on rollback.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {hubLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-2 text-xs font-black ${
              link.active ? "vyron-grad-surface text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <section className="rounded-[2rem] border border-violet-100 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            placeholder="Search supplier, invoice, item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Date from"
          />
          <input
            type="date"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Date to"
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            placeholder="Filter supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-xl vyron-grad-surface px-4 py-2 text-xs font-semibold text-white"
        >
          Apply filters
        </button>
      </section>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}

      <section className="rounded-[2rem] border border-violet-100 bg-white p-5 overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm font-bold text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Loading price history…
          </div>
        ) : (
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="text-[10px] font-black uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Supplier</th>
                <th className="py-2 pr-3">Invoice</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Previous</th>
                <th className="py-2 pr-3">Current</th>
                <th className="py-2 pr-3">Difference</th>
                <th className="py-2 pr-3">%</th>
                <th className="py-2 pr-3">Movement</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const movement = row.price_movement || "no_change";
                const date = String(row.approved_at || row.created_at || "").slice(0, 10);
                const prev = Number(row.previous_price || 0);
                const next = Number(row.new_price || 0);
                const diff = row.price_difference ?? next - prev;
                const pct = row.percentage_change;
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{date || "—"}</td>
                    <td className="py-2 pr-3">{row.supplier_name || "—"}</td>
                    <td className="py-2 pr-3">
                      {row.document_id ? (
                        <Link href={`/document-intelligence/archive/${row.document_id}`} className="font-bold text-violet-700 hover:underline">
                          {row.invoice_number || row.document_id.slice(0, 8)}
                        </Link>
                      ) : (
                        row.invoice_number || "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-bold text-slate-900">{row.entity_name || "—"}</div>
                      <div className="text-[11px] text-slate-400">{row.item_description || row.entity_type}</div>
                    </td>
                    <td className="py-2 pr-3">R{prev.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-black">R{next.toFixed(2)}</td>
                    <td className="py-2 pr-3">R{Number(diff).toFixed(2)}</td>
                    <td className="py-2 pr-3">{pct !== null && pct !== undefined ? `${Number(pct).toFixed(1)}%` : "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${priceMovementClass(movement)}`}>
                        {priceMovementLabel(movement)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !rows.length ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">No price history for this filter.</p>
        ) : null}
      </section>
    </div>
  );
}
