"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

export default function InventoryStockDetailClient({ stockItemId }: { stockItemId: string }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [ledger, setLedger] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    const { query } = poApiWorkspaceContext();
    const ledgerParams = new URLSearchParams(query ? query.slice(1) : "");
    ledgerParams.set("stockItemId", stockItemId);
    const [stockRes, ledgerRes] = await Promise.all([
      fetch(`/api/inventory/stock/${stockItemId}${query}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/inventory/ledger?${ledgerParams}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (stockRes.ok) setItem(stockRes.item);
    else {
      setItem(null);
      setMessage(stockRes.error || "Stock item not found.");
    }
    if (ledgerRes.ok) setLedger(ledgerRes.entries || []);
  }, [stockItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!item) return <p className="text-sm font-bold text-slate-500">{message || "Loading stock item…"}</p>;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        badge: "Stock Intelligence",
        title: "Inventory Stock Detail Centre",
        subtitle: "Inspect valuation, on-hand balance, and ledger movement history for individual stock items.",
        outcomes: ["Validate stock valuation integrity", "Trace movement history line-by-line", "Spot reorder and supplier dependencies quickly"],
        formulas: ["Inventory Value = Qty on Hand x Average Cost", "Balance After = Prior Balance + In - Out", "Reorder Signal = Qty on Hand vs Reorder Level"],
        intelligenceItems: [
          { label: "Item focus", detail: String(item.description || item.item_code || stockItemId) },
          { label: "Ledger depth", detail: `${ledger.length} movement rows loaded` },
          { label: "Valuation method", detail: String(item.valuation_method || "Not set") },
        ],
      }}
    >
      <section className="grid gap-6">
        <Link href="/inventory/stock" className="text-xs font-black text-violet-700">
        ← Stock Master
        </Link>
        <h1 className="text-3xl font-black">{String(item.description)}</h1>
      <p className="text-sm text-slate-600">
        {String(item.item_code)} · {String(item.entity_type)} · {String(item.stock_status)} · {String(item.valuation_method)}
      </p>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">On Hand</div>
          <div className="text-2xl font-black">
            {Number(item.qty_on_hand).toFixed(2)} {String(item.unit)}
          </div>
        </div>
        <div className="rounded-2xl bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Avg Cost</div>
          <div className="text-2xl font-black">R{Number(item.average_cost).toFixed(2)}</div>
        </div>
        <div className="rounded-2xl bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Current Cost</div>
          <div className="text-2xl font-black">R{Number(item.current_cost).toFixed(2)}</div>
        </div>
        <div className="rounded-2xl bg-violet-50 p-4">
          <div className="text-[10px] font-black uppercase text-violet-600">Inventory Value</div>
          <div className="text-2xl font-black">{formatMoney(Number(item.inventory_value))}</div>
        </div>
      </div>
      <div className="text-xs text-slate-500">
        Reorder {Number(item.reorder_level)} · Min {Number(item.min_level)} · Max {Number(item.max_level)}
        {item.supplier_name_snapshot ? ` · Supplier ${String(item.supplier_name_snapshot)}` : ""}
      </div>
        <div className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="border-b px-4 py-3 text-sm font-black">Stock Ledger</h2>
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 font-black uppercase text-[#A3E635]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th>Type</th>
              <th>In</th>
              <th>Out</th>
              <th>Balance</th>
              <th>Unit Cost</th>
              <th>Value</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={String(row.id)} className="border-t">
                <td className="px-3 py-2">{String(row.movement_date || "").slice(0, 16)}</td>
                <td className="font-bold">{String(row.movement_type)}</td>
                <td>{Number(row.quantity_in)}</td>
                <td>{Number(row.quantity_out)}</td>
                <td className="font-black">{Number(row.balance_after)}</td>
                <td>R{Number(row.unit_cost).toFixed(2)}</td>
                <td>R{Number(row.value).toFixed(2)}</td>
                <td>{String(row.reference_label || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
