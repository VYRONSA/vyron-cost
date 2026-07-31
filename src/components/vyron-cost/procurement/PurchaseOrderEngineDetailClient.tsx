"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import type {
  PurchaseOrderEngineRow,
  SupplierPerformanceSnapshot,
} from "@/lib/vyron-purchase-order-engine";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrderEngineDetailClient({ poId }: { poId: string }) {
  const [po, setPo] = useState<PurchaseOrderEngineRow | null>(null);
  const [supplierPerformance, setSupplierPerformance] = useState<SupplierPerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [partialQty, setPartialQty] = useState<Record<string, string>>({});

  async function loadPo() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchase-orders/engine?id=${poId}`);
      const data = await response.json();
      if (!data.ok || !data.purchaseOrder) {
        setError(data.error || "Purchase order not found.");
        return;
      }
      setPo(data.purchaseOrder as PurchaseOrderEngineRow);
      setSupplierPerformance((data.supplierPerformance as SupplierPerformanceSnapshot) || null);
    } catch {
      setError("Purchase order not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPo();
  }, [poId]);

  async function markSent() {
    setError(null);
    const response = await fetch("/api/purchase-orders/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: poId, status: "Sent" }),
    });
    const data = await response.json();
    if (!data.ok) {
      setError(data.error || "Could not update status.");
      return;
    }
    setPo(data.purchaseOrder as PurchaseOrderEngineRow);
    setMessage("Purchase order marked as Sent.");
  }

  async function receive(mode: "full" | "partial") {
    setReceiving(true);
    setError(null);
    setMessage(null);
    try {
      const lines =
        mode === "partial"
          ? (po?.lines || [])
              .map((line) => ({
                line_id: line.id,
                receive_qty: Number(partialQty[line.id] || 0),
              }))
              .filter((line) => line.receive_qty > 0)
          : undefined;

      const response = await fetch(`/api/purchase-orders/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, lines }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Receive failed.");
        return;
      }
      setPo(data.purchaseOrder as PurchaseOrderEngineRow);
      setMessage(mode === "full" ? "Full receipt posted to inventory." : "Partial receipt posted to inventory.");
      setPartialQty({});
    } catch {
      setError("Receive failed.");
    } finally {
      setReceiving(false);
    }
  }

  const canReceive = po && !["Draft", "Cancelled", "Received", "Fully Received", "Closed"].includes(po.status);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Purchase Order Engine",
        title: po?.po_number || "Purchase Order",
        subtitle: po ? `${po.supplier_name} · ${po.display_status}` : "Loading…",
        outcomes: [
          "Ordered vs received vs outstanding per ingredient",
          "Receive full or partial into inventory",
          "Supplier performance warnings only",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          {po?.status === "Draft" ? (
            <button
              type="button"
              onClick={() => void markSent()}
              className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white"
            >
              Mark Sent
            </button>
          ) : null}
          {canReceive ? (
            <>
              <button
                type="button"
                disabled={receiving}
                onClick={() => void receive("full")}
                className="rounded-xl vyron-grad-surface px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Receive Full
              </button>
              <button
                type="button"
                disabled={receiving}
                onClick={() => void receive("partial")}
                className="rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-bold text-violet-700 disabled:opacity-60"
              >
                Receive Partial
              </button>
            </>
          ) : null}
          <Link href="/purchase-orders" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Back to list
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Loading purchase order…
          </div>
        ) : po ? (
          <>
            <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-4`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Total Value</div>
                <div className="mt-1 text-2xl font-black">{formatMoney(po.total_value)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Order Date</div>
                <div className="mt-1 text-2xl font-black">{po.order_date || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Expected Date</div>
                <div className="mt-1 text-2xl font-black">{po.expected_date || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Status</div>
                <div className="mt-1 text-2xl font-black">{po.display_status}</div>
              </div>
            </section>

            {supplierPerformance ? (
              <section className={VYRON_MASTER.moduleDataSection}>
                <h2 className="mb-3 text-lg font-black text-[#0F172A]">Supplier Performance</h2>
                <div className="grid gap-3 md:grid-cols-4 text-sm">
                  <div>Lead time: <strong>{supplierPerformance.lead_time_days} days</strong></div>
                  <div>On-time delivery: <strong>{supplierPerformance.on_time_delivery_pct}%</strong></div>
                  <div>Order count: <strong>{supplierPerformance.order_count}</strong></div>
                  <div>Purchase value: <strong>{formatMoney(supplierPerformance.purchase_value)}</strong></div>
                </div>
                {supplierPerformance.warning ? (
                  <div className="mt-3 rounded-xl bg-[var(--vyron-warning-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-warning-fg)]">
                    {supplierPerformance.warning}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className={VYRON_MASTER.moduleDataSection}>
              <h2 className="mb-4 text-lg font-black text-[#0F172A]">Order Lines</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      <th className="px-4 py-3 text-left">Ingredient</th>
                      <th className="px-4 py-3 text-right">Ordered Qty</th>
                      <th className="px-4 py-3 text-right">Received Qty</th>
                      <th className="px-4 py-3 text-right">Outstanding</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      {canReceive ? <th className="px-4 py-3 text-right">Receive Qty</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {(po.lines || []).map((line) => (
                      <tr key={line.id} className={VYRON_TABLE.row}>
                        <td className="px-4 py-3 font-semibold">{line.ingredient_name}</td>
                        <td className="px-4 py-3 text-right text-sm">{line.quantity} {line.unit}</td>
                        <td className="px-4 py-3 text-right text-sm">{line.received_qty} {line.unit}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-[var(--vyron-warning-fg)]">
                          {line.outstanding_qty} {line.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">{formatMoney(line.line_total)}</td>
                        {canReceive ? (
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max={line.outstanding_qty}
                              value={partialQty[line.id] || ""}
                              onChange={(e) =>
                                setPartialQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                              className="w-24 rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm"
                              placeholder="0"
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </VyronPremiumPageShell>
  );
}
