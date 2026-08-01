"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCurrency, formatNumber, type StockMovement } from "@/lib/vyron-cost/stock-engine";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

const movementLabels: Record<string, string> = {
  GRN_RECEIPT: "GRN Receipt",
  MANUFACTURING_CONSUMPTION: "Manufacturing Consumption",
  MANUFACTURING_OUTPUT: "Manufacturing Output",
  CUSTOMER_INVOICE: "Customer Invoice",
  STOCK_COUNT: "Stock Count",
  DAMAGE: "Damage",
  REJECTION: "Rejection",
  ADJUSTMENT: "Adjustment",
};

export default function StockLedgerClient() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/stock-movements${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.movements)) {
          setMovements(d.movements as StockMovement[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalIn = movements.reduce((sum, item) => sum + item.quantity_in, 0);
  const totalOut = movements.reduce((sum, item) => sum + item.quantity_out, 0);
  const totalValue = movements.reduce((sum, item) => sum + item.total_value, 0);

  return (
    <div className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Inventory Workspace"
        title="Stock Movement Ledger"
        subtitle="Single source of truth for GRNs, manufacturing, customer invoices, stock counts and adjustments."
        outcomes={[
          "Review every stock movement in one ledger",
          "Export CSV for audit and analysis",
          "Trace references back to source documents",
          "Validate quantity in, out and value impact",
        ]}
        quotes={[
          { label: "Audit", quote: "What gets measured gets protected." },
          { label: "Traceability", quote: "Great businesses are built on disciplined margins." },
        ]}
      />

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Ledger"
        title="Movement formulas"
        formulas={[
          { label: "Movement Value", formula: "Quantity × unit cost at posting" },
          { label: "Net Movement", formula: "Quantity in − quantity out" },
          { label: "Inventory Value", formula: "On-hand qty × weighted average cost" },
        ]}
        className="max-w-2xl"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Movement Records" value={loading ? "…" : formatNumber(movements.length)} />
        <MetricCard title="Quantity In" value={loading ? "…" : formatNumber(totalIn)} />
        <MetricCard title="Quantity Out" value={loading ? "…" : formatNumber(totalOut)} />
        <MetricCard title="Movement Value" value={loading ? "…" : formatCurrency(totalValue)} />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)] backdrop-blur-xl">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <VyronPremiumSectionHeading
            eyebrow="Movement register"
            title="Complete stock movement ledger"
            subtitle="GRNs, manufacturing, sales invoices and adjustments in one auditable view."
          />
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button onClick={() => window.print()} className="rounded-full border border-purple-200 bg-white px-4 py-2 text-sm font-bold text-purple-800">Print</button>
            <button onClick={() => exportCsv(movements)} className="rounded-full bg-purple-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-purple-700/20">Export CSV</button>
          </div>
        </div>

        {!loading && movements.length === 0 ? (
          <VyronPremiumEmptyState
            steps={[
              "Post a GRN to record goods received into stock.",
              "Complete a manufacturing run to consume and output inventory.",
              "Invoice customers or post stock count variances.",
              "Return here to audit the full movement trail.",
            ]}
          />
        ) : null}

        <EnterpriseScrollContainer className="rounded-3xl border border-slate-100">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Movement</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Qty In</th>
                <th className="px-4 py-3 text-right">Qty Out</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-purple-50/60">
                  <td className="px-4 py-3 font-semibold text-slate-800">{movement.movement_date}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800">{movementLabels[movement.movement_type] ?? movement.movement_type}</span></td>
                  <td className="px-4 py-3 font-bold text-slate-950">{movement.item_name}</td>
                  <td className="px-4 py-3"><Link className="font-bold text-purple-700 hover:underline" href={`/inventory-intelligence/traceability?ref=${movement.reference_number}`}>{movement.reference_number}</Link></td>
                  <td className="px-4 py-3 text-right font-semibold text-[#7E22CE]">{movement.quantity_in ? formatNumber(movement.quantity_in) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-700">{movement.quantity_out ? formatNumber(movement.quantity_out) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(movement.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-black">{formatCurrency(movement.total_value)}</td>
                  <td className="px-4 py-3 text-slate-600">{movement.location_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EnterpriseScrollContainer>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function exportCsv(movements: StockMovement[]) {
  const rows = [
    ["Date", "Movement", "Item", "Reference", "Qty In", "Qty Out", "Unit Cost", "Value", "Location"],
    ...movements.map((m) => [m.movement_date, m.movement_type, m.item_name, m.reference_number, m.quantity_in, m.quantity_out, m.unit_cost, m.total_value, m.location_name ?? ""]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vyron-cost-stock-ledger.csv";
  link.click();
  URL.revokeObjectURL(url);
}
