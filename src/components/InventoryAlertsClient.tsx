"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatMoney } from "@/lib/vyron-cost-data";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

export default function InventoryAlertsClient() {
  const router = useRouter();
  const [data, setData] = useState<{
    lowStockAlerts: Array<Record<string, unknown>>;
    slowMoving30: Array<Record<string, unknown>>;
    overstock: Array<Record<string, unknown>>;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/alerts${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createPo(alertId: string) {
    setBusyId(alertId);
    setMessage("");
    const { body: workspaceBody } = poApiWorkspaceContext();
    const res = await fetch("/api/inventory/alerts/create-po", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...workspaceBody, alertId, actor: "user" }),
    });
    const payload = await res.json();
    setBusyId(null);
    if (!payload.ok) {
      setMessage(payload.error || "Could not create purchase order.");
      return;
    }
    if (payload.po?.id) {
      router.push(`/purchase-orders/${payload.po.id}`);
      return;
    }
    setMessage(`Purchase order ${payload.po?.po_number || ""} created with prefilled supplier and quantity.`);
    refresh();
  }

  if (!data) return <p className="text-sm text-slate-500">Loading alerts…</p>;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        badge: "Inventory Intelligence",
        title: "Inventory Alert Command Centre",
        subtitle: "Resolve low-stock, slow-moving, and overstock signals with direct procurement actions.",
        outcomes: ["Act quickly on stock shortages", "Reduce capital trapped in overstock", "Link alerts to PO creation workflows"],
        formulas: ["Estimated Cost = Required Qty x Last/Expected Unit Cost", "Excess Value = Excess Qty x Current Cost", "Idle Risk = Days since movement threshold"],
        intelligenceItems: [
          { label: "Low stock alerts", detail: `${data.lowStockAlerts.length} active replenishment triggers` },
          { label: "Slow movers", detail: `${data.slowMoving30.length} items idle beyond threshold` },
          { label: "Overstock", detail: `${data.overstock.length} inventory positions flagged` },
        ],
      }}
    >
      <section className="grid gap-8">
        {message ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{message}</p> : null}
        <div className="grid gap-8 lg:grid-cols-3">
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/50 p-5">
          <h2 className="text-lg font-black text-fuchsia-900">Low Stock Alerts</h2>
          <p className="mt-1 text-xs font-semibold text-fuchsia-800">Create a purchase order with supplier, last cost and suggested quantity prefilled.</p>
          <div className="mt-3 space-y-2">
            {data.lowStockAlerts.map((a) => {
              const item = a.vyron_cost_stock_items as Record<string, unknown>;
              const alertId = String(a.id);
              return (
                <div key={alertId} className="rounded-xl bg-white p-3 text-sm">
                  <div className="font-black">{String(item?.description)}</div>
                  <div>Required: {Number(a.required_qty)} · Est. {formatMoney(Number(a.estimated_cost))}</div>
                  <div className="text-xs text-slate-500">Supplier: {String(a.preferred_supplier_name || "—")}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === alertId}
                      onClick={() => void createPo(alertId)}
                      className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-[#F8FAFC] disabled:opacity-50"
                    >
                      {busyId === alertId ? "Creating…" : "Create Purchase Order"}
                    </button>
                  </div>
                </div>
              );
            })}
            {data.lowStockAlerts.length === 0 ? <p className="text-sm text-slate-500">No open low stock alerts.</p> : null}
          </div>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
          <h2 className="text-lg font-black text-violet-900">Slow Moving (30+ days)</h2>
          <div className="mt-3 space-y-2">
            {data.slowMoving30.slice(0, 10).map((item) => (
              <div key={String(item.id)} className="rounded-xl bg-white p-3 text-sm">
                <div className="font-black">{String(item.description)}</div>
                <div>
                  Value {formatMoney(Number(item.inventory_value))} · {Number(item.daysSinceMovement)} days idle
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
          <h2 className="text-lg font-black text-red-900">Overstock</h2>
          <div className="mt-3 space-y-2">
            {data.overstock.map((item) => (
              <div key={String(item.id)} className="rounded-xl bg-white p-3 text-sm">
                <div className="font-black">{String(item.description)}</div>
                <div>
                  Excess {Number(item.excessQty)} · {formatMoney(Number(item.excessValue))}
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
