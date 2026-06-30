"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import StoreOrderQueueTable from "@/components/vyron-cost/store-ordering/StoreOrderQueueTable";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { StoreOrderRow } from "@/lib/vyron-store-orders";

type DispatchTab = "ReadyToDispatch" | "Dispatched" | "Delivered";

const TABS: { id: DispatchTab; label: string }[] = [
  { id: "ReadyToDispatch", label: "Ready for Dispatch" },
  { id: "Dispatched", label: "Dispatched" },
  { id: "Delivered", label: "Delivered" },
];

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

export default function DispatchBoardClient() {
  const { canEdit } = useModulePermissions("store_orders");
  const [orders, setOrders] = useState<StoreOrderRow[]>([]);
  const [tab, setTab] = useState<DispatchTab>("ReadyToDispatch");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/store-orders?statuses=ReadyToDispatch,Dispatched,Delivered");
      const data = await response.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as StoreOrderRow[]);
        return;
      }
      setOrders([]);
      setError(data.error || "Could not load dispatch board.");
    } catch {
      setOrders([]);
      setError("Could not load dispatch board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filtered = useMemo(() => orders.filter((order) => order.status === tab), [orders, tab]);

  async function handleAction(orderId: string, action: "dispatch" | "mark_delivered") {
    if (!canEdit) return;
    setBusyId(orderId);
    setError(null);
    setMessage(null);
    try {
      await runWorkflow(orderId, action);
      setMessage(action === "dispatch" ? "Order dispatched." : "Order marked delivered.");
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
        title: "Dispatch Board",
        subtitle: "Track orders from pick-complete through delivery.",
        outcomes: ["Dispatch ready orders", "Confirm delivery to stores", "Monitor in-transit fulfilment"],
      }}
    >
      <div className="space-y-6">
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  tab === item.id
                    ? "bg-[#0F172A] text-white"
                    : "border border-[#E2E8F0] bg-white text-[#334155]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <StoreOrderQueueTable
            orders={filtered}
            loading={loading}
            columns={["order", "store", "deliveryDate", "status", "actions"]}
            emptyMessage={`No ${TABS.find((item) => item.id === tab)?.label.toLowerCase()} orders.`}
            renderActions={(order) => (
              <>
                {canEdit && order.status === "ReadyToDispatch" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void handleAction(order.id, "dispatch")}
                    className={`${VYRON_MASTER.primaryBtn} px-3 py-1.5 text-xs disabled:opacity-60`}
                  >
                    Dispatch
                  </button>
                ) : null}
                {canEdit && order.status === "Dispatched" ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => void handleAction(order.id, "mark_delivered")}
                    className={`${VYRON_MASTER.primaryBtn} px-3 py-1.5 text-xs disabled:opacity-60`}
                  >
                    Mark Delivered
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
