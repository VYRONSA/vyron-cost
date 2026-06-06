"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function InventoryLedgerClient() {
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/inventory/ledger")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setEntries(d.entries || []);
      });
  }, []);

  return (
    <section>
      <Link href="/inventory" className="text-xs font-black text-violet-700">
        ← Inventory Dashboard
      </Link>
      <h2 className="mt-4 text-2xl font-black">Permanent Stock Ledger</h2>
      <table className="mt-4 min-w-full text-xs">
        <thead className="bg-slate-900 font-black uppercase text-emerald-300">
          <tr>
            <th className="px-2 py-2">Date</th>
            <th>Item</th>
            <th>Movement</th>
            <th>In</th>
            <th>Out</th>
            <th>Balance</th>
            <th>Cost</th>
            <th>Value</th>
            <th>Reference</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => {
            const item = row.vyron_cost_stock_items as Record<string, unknown> | undefined;
            return (
              <tr key={String(row.id)} className="border-t">
                <td className="px-2 py-2">{String(row.movement_date || "").slice(0, 16)}</td>
                <td className="font-bold">{String(item?.description || "—")}</td>
                <td>{String(row.movement_type)}</td>
                <td>{Number(row.quantity_in)}</td>
                <td>{Number(row.quantity_out)}</td>
                <td className="font-black">{Number(row.balance_after)}</td>
                <td>R{Number(row.unit_cost).toFixed(2)}</td>
                <td>R{Number(row.value).toFixed(2)}</td>
                <td>{String(row.reference_label || "—")}</td>
                <td>{String(row.actor || "—")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
