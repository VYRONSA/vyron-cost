"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import {
  PROCUREMENT_REQUISITION_STATUS_LABELS,
  type ProcurementRequisitionRow,
} from "@/lib/vyron-procurement-requisitions";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NEXT_STATUS: Record<string, { status: string; label: string } | null> = {
  Draft: { status: "Approved", label: "Approve" },
  Approved: { status: "ReadyForPurchase", label: "Mark Ready For Purchase" },
  Ordered: { status: "Received", label: "Mark Received" },
};

export default function ProcurementRequisitionDetailClient({ requisitionId }: { requisitionId: string }) {
  const [requisition, setRequisition] = useState<ProcurementRequisitionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRequisition() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/procurement-requisitions/${requisitionId}`);
      const data = await response.json();
      if (!data.ok || !data.requisition) {
        setError(data.error || "Requisition not found.");
        return;
      }
      setRequisition(data.requisition as ProcurementRequisitionRow);
    } catch {
      setError("Requisition not found.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequisition();
  }, [requisitionId]);

  async function advanceStatus(nextStatus: string) {
    setUpdating(true);
    setError(null);
    try {
      const response = await fetch(`/api/procurement-requisitions/${requisitionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Status update failed.");
        return;
      }
      setRequisition(data.requisition as ProcurementRequisitionRow);
    } catch {
      setError("Status update failed.");
    } finally {
      setUpdating(false);
    }
  }

  async function generatePurchaseOrders() {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/procurement-requisitions/${requisitionId}/generate-pos`, {
        method: "POST",
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Could not generate purchase orders.");
        return;
      }
      const count = Array.isArray(data.purchase_orders) ? data.purchase_orders.length : 0;
      setMessage(`Generated ${count} purchase order${count === 1 ? "" : "s"} grouped by supplier.`);
      setRequisition(data.requisition as ProcurementRequisitionRow);
    } catch {
      setError("Could not generate purchase orders.");
    } finally {
      setGenerating(false);
    }
  }

  const nextAction = requisition ? NEXT_STATUS[requisition.status] : null;
  const canGeneratePo =
    requisition?.status === "Approved" || requisition?.status === "ReadyForPurchase";

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Procurement Intelligence",
        title: requisition?.requisition_number || "Requisition",
        subtitle: requisition
          ? `${PROCUREMENT_REQUISITION_STATUS_LABELS[requisition.status as keyof typeof PROCUREMENT_REQUISITION_STATUS_LABELS] || requisition.status} · ${requisition.lines?.length || 0} lines`
          : "Loading…",
        outcomes: [
          "Required vs available vs shortage per ingredient",
          "Supplier recommendation with lead time and reliability",
          "Generate supplier-grouped purchase orders",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          {canGeneratePo ? (
            <button
              type="button"
              disabled={generating || updating}
              onClick={() => void generatePurchaseOrders()}
              className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate Purchase Orders"}
            </button>
          ) : null}
          {nextAction ? (
            <button
              type="button"
              disabled={updating}
              onClick={() => void advanceStatus(nextAction.status)}
              className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {updating ? "Updating…" : nextAction.label}
            </button>
          ) : null}
          {requisition?.status === "Draft" || requisition?.status === "Approved" ? (
            <button
              type="button"
              disabled={updating}
              onClick={() => void advanceStatus("Cancelled")}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
          <Link href="/procurement" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Back to list
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
            {message}{" "}
            <Link href="/purchase-orders" className="font-bold underline">
              View purchase orders
            </Link>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Loading requisition…
          </div>
        ) : requisition ? (
          <>
            <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-3`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Estimated Cost</div>
                <div className="mt-1 text-2xl font-black">{formatMoney(requisition.estimated_cost || 0)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Required Date</div>
                <div className="mt-1 text-2xl font-black">{requisition.required_date || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Status</div>
                <div className="mt-1 text-2xl font-black">
                  {PROCUREMENT_REQUISITION_STATUS_LABELS[requisition.status as keyof typeof PROCUREMENT_REQUISITION_STATUS_LABELS] || requisition.status}
                </div>
              </div>
            </section>

            {requisition.notes ? (
              <section className={VYRON_MASTER.moduleDataSection}>
                <p className="text-sm text-[#64748B]">{requisition.notes}</p>
              </section>
            ) : null}

            <section className={VYRON_MASTER.moduleDataSection}>
              <h2 className="mb-4 text-lg font-black text-[#0F172A]">Requisition Lines</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
                <table className="min-w-full">
                  <thead className={VYRON_TABLE.head}>
                    <tr>
                      <th className="px-4 py-3 text-left">Ingredient</th>
                      <th className="px-4 py-3 text-right">Required</th>
                      <th className="px-4 py-3 text-right">Available</th>
                      <th className="px-4 py-3 text-right">Shortage</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-left">Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(requisition.lines || []).map((line) => {
                      const rec = line.recommended_supplier;
                      return (
                        <tr key={line.id} className={VYRON_TABLE.row}>
                          <td className="px-4 py-3 font-semibold">{line.ingredient_name}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            {line.required_qty} {line.unit}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {line.available_qty} {line.unit}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-fuchsia-700">
                            {line.shortage_qty} {line.unit}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {rec ? (
                              <div>
                                <div className="font-semibold">{rec.supplier_name}</div>
                                <div className="text-xs text-[#64748B]">
                                  Lead {rec.lead_time_days}d · Reliability {rec.reliability_score}% · Last {formatMoney(rec.last_cost)}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{formatMoney(line.estimated_cost)}</td>
                          <td className="px-4 py-3">
                            {rec?.warning ? (
                              <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-fuchsia-800">
                                {rec.warning}
                              </span>
                            ) : (
                              "OK"
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
