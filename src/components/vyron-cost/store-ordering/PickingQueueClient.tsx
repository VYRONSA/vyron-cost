"use client";

import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import StoreOrderQueueTable from "@/components/vyron-cost/store-ordering/StoreOrderQueueTable";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreOrderRow } from "@/lib/vyron-store-orders";

async function runWorkflow(orderId: string, action: string) {
  const response = await fetch(`/api/store-orders/${orderId}/workflow`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Action failed.");
  return data.order as StoreOrderRow;
}

export default function PickingQueueClient() {
  const { canEdit } = useModulePermissions("store_orders");
  const [orders, setOrders] = useState<StoreOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store-orders?statuses=Approved,Picking");
      const data = await response.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as StoreOrderRow[]);
        return;
      }
      setOrders([]);
      setError(data.error || "Could not load picking queue.");
    } catch {
      setOrders([]);
      setError("Could not load picking queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleAction(orderId: string, action: "start_picking" | "complete_picking") {
    if (!canEdit) return;
    setBusyId(orderId);
    setError(null);
    setMessage(null);
    try {
      await runWorkflow(orderId, action);
      setMessage(action === "start_picking" ? "Picking started." : "Picking completed — ready for dispatch.");
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
        title: "Picking Queue",
        subtitle: "Approved store orders ready for warehouse picking.",
        outcomes: ["Start picking against approved orders", "Complete picking and release to dispatch"],
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
            columns={["order", "store", "deliveryDate", "status", "actions"]}
            emptyMessage="No orders in the picking queue."
            renderActions={(order) => (
              <>
                {canEdit && order.status === "Approved" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void handleAction(order.id, "start_picking")}
                    className={`${VYRON_MASTER.primaryBtn} px-3 py-1.5 text-xs disabled:opacity-60`}
                  >
                    Start Picking
                  </button>
                ) : null}
                {canEdit && order.status === "Picking" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void handleAction(order.id, "complete_picking")}
                    className={`${VYRON_MASTER.primaryBtn} px-3 py-1.5 text-xs disabled:opacity-60`}
                  >
                    Complete Picking
                  </button>
                ) : null}
              </>
            )}
          />
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
