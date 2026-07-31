"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_TABLE } from "@/components/vyron-ui";
import type { InventoryLedgerEntry } from "@/lib/vyron-inventory-transactions";

function formatMoney(value: number) {
  return value.toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 });
}

export default function InventoryLedgerPageClient() {
  const [entries, setEntries] = useState<InventoryLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/inventory-transactions/ledger", { cache: "no-store" });
        const data = await response.json();
        if (data.ok) setEntries(data.entries || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Inventory Intelligence",
        title: "Inventory Ledger",
        subtitle: "Single source of truth for every stock movement with running balance.",
        outcomes: [
          "Trace every receipt, issue, and adjustment",
          "See running balance per item",
          "Audit references to production and dispatch",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/stock-movements" className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white">
            Stock Movements
          </Link>
          <Link href="/inventory" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Inventory
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
          Loading ledger…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm text-[#64748B]">
          No inventory transactions yet. Post a stock movement to begin the ledger.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
          <table className="min-w-full text-sm">
            <thead className={VYRON_TABLE.head}>
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Transaction #</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id} className={VYRON_TABLE.row}>
                  <td className="px-4 py-3">{row.created_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.transaction_number}</td>
                  <td className="px-4 py-3">{row.transaction_type}</td>
                  <td className="px-4 py-3 font-semibold">{row.item_name}</td>
                  <td className={`px-4 py-3 text-right font-bold ${row.signed_quantity < 0 ? "text-rose-600" : "text-violet-700"}`}>
                    {row.signed_quantity > 0 ? "+" : ""}
                    {row.signed_quantity}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.total_cost)}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.reference_label || row.reference_type || "—"}</td>
                  <td className="px-4 py-3 text-right font-black">{row.running_balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </VyronPremiumPageShell>
  );
}
