"use client";

import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import StoreOrderQueueTable from "@/components/vyron-cost/store-ordering/StoreOrderQueueTable";
import { StoreOrderWarningBadges } from "@/components/vyron-cost/store-ordering/StoreOrderWarningBadges";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreOrderRow } from "@/lib/vyron-store-orders";

async function runWorkflow(orderId: string, action: string, note?: string) {
  const response = await fetch(`/api/store-orders/${orderId}/workflow`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Action failed.");
  return data.order as StoreOrderRow;
}

export default function ApprovalQueueClient() {
  const { canApprove } = useModulePermissions("store_orders");
  const [orders, setOrders] = useState<StoreOrderRow[]>([]);
  const [warningsByOrderId, setWarningsByOrderId] = useState<Record<string, { code: string; message: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store-orders?status=Submitted&includeWarnings=true");
      const data = await response.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as StoreOrderRow[]);
        setWarningsByOrderId((data.warningsByOrderId || {}) as Record<string, { code: string; message: string }[]>);
        return;
      }
      setOrders([]);
      setError(data.error || "Could not load approval queue.");
    } catch {
      setOrders([]);
      setError("Could not load approval queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleAction(orderId: string, action: "approve" | "reject" | "request_change") {
    if (!canApprove) return;
    let note: string | undefined;
    if (action === "reject") {
      const reason = window.prompt("Rejection reason (optional):");
      if (reason === null) return;
      note = reason;
    }
    if (action === "request_change") {
      const changeNote = window.prompt("Describe the changes required:");
      if (!changeNote?.trim()) return;
      note = changeNote.trim();
    }

    setBusyId(orderId);
    setError(null);
    setMessage(null);
    try {
      await runWorkflow(orderId, action, note);
      setMessage(
        action === "approve"
          ? "Order approved."
          : action === "reject"
            ? "Order rejected."
            : "Change requested — order returned to draft."
      );
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Approval Queue",
        subtitle: "Submitted store orders awaiting supervisor approval.",
        outcomes: ["Approve orders for picking", "Reject invalid orders", "Request changes and return to draft"],
      }}
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-[var(--vyron-success-border)] bg-[var(--vyron-success-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-success-fg)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <StoreOrderQueueTable
            orders={orders}
            loading={loading}
            columns={["order", "store", "deliveryDate", "total", "actions"]}
            emptyMessage="No orders awaiting approval."
            renderActions={(order) => (
              <div className="flex flex-col gap-2">
                <div className="text-xs text-[#64748B]">
                  Margin {Number(order.margin_pct || 0).toFixed(1)}% · Cost {formatStoreOrderMoney(order.estimated_cost || 0)}
                </div>
                <StoreOrderWarningBadges warnings={warningsByOrderId[order.id] || []} />
                {canApprove ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => void handleAction(order.id, "approve")}
                      className={`${VYRON_MASTER.primaryBtn} px-3 py-1.5 text-xs disabled:opacity-60`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => void handleAction(order.id, "reject")}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => void handleAction(order.id, "request_change")}
                      className="rounded-lg border border-[var(--vyron-warning-border)] px-3 py-1.5 text-xs font-bold text-[var(--vyron-warning-fg)] disabled:opacity-60"
                    >
                      Request Change
                    </button>
                  </>
                ) : null}
              </div>
            )}
          />
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
