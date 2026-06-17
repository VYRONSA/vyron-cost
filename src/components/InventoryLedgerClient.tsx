"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

export default function InventoryLedgerClient() {
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/ledger${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setEntries(d.entries || []);
      })
      .finally(() => setLoaded(true));
  }, []);

  return (
    <section className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Inventory Workspace"
        title="Permanent Stock Ledger"
        subtitle="Every GRN, production run, stock count and adjustment leaves an auditable movement trail — your inventory financial truth."
        outcomes={[
          "Trace quantity in and out per item",
          "See balance after every movement",
          "Review unit cost and value impact",
          "Audit reference and actor per entry",
        ]}
        quotes={[
          { label: "Integrity", quote: "What gets measured gets protected." },
          { label: "Cash", quote: "Inventory is cash wearing a disguise." },
        ]}
      >
        <Link href="/inventory" className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-sm">
          ← Inventory Dashboard
        </Link>
      </VyronPremiumHeroBanner>

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Ledger"
        title="Movement value formulas"
        formulas={[
          { label: "Movement Value", formula: "Quantity × unit cost at time of posting" },
          { label: "Balance After", formula: "Prior balance + qty in − qty out" },
          { label: "Weighted Avg", formula: "(Prior value + receipt value) ÷ total qty" },
        ]}
        className="max-w-2xl"
      />

      <VyronPremiumSectionHeading eyebrow="Audit trail" title="Ledger entries" subtitle="Permanent record of inventory movements for this workspace." />

      {loaded && entries.length === 0 ? (
        <VyronPremiumEmptyState
          steps={[
            "Receive goods via a GRN to post stock in.",
            "Complete a production run to consume and output stock.",
            "Run a stock count and post approved variances.",
            "Return here to review the full movement history.",
          ]}
        />
      ) : null}

      <div className="overflow-x-auto rounded-[2rem] border border-violet-100 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-900 font-black uppercase text-[#A3E635]">
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
      </div>
    </section>
  );
}
