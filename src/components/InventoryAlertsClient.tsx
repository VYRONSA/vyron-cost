"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";

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
    fetch("/api/inventory/alerts")
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
    const res = await fetch("/api/inventory/alerts/create-po", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, actor: "user" }),
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
    <section className="grid gap-8">
      {message ? <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">{message}</p> : null}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-lg font-black text-amber-900">Low Stock Alerts</h2>
          <p className="mt-1 text-xs font-semibold text-amber-800">Create a purchase order with supplier, last cost and suggested quantity prefilled.</p>
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
                      className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
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
  );
}
