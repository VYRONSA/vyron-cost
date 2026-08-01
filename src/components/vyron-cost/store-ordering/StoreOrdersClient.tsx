"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { STORE_ORDER_STATUSES, type StoreOrderRow } from "@/lib/vyron-store-orders";
import {
  renderStoreOrderStatus,
  storeOrderStatusClass,
  formatStoreOrderMoney,
} from "@/components/vyron-cost/store-ordering/store-order-ui";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type QueueStatus = "New" | "Processing" | "Invoiced" | "Completed" | "Cancelled";

function queueStatusFor(orderStatus: string): QueueStatus {
  if (orderStatus === "Cancelled") return "Cancelled";
  if (orderStatus === "Delivered") return "Completed";
  if (orderStatus === "Dispatched") return "Invoiced";
  if (["Approved", "Picking", "ReadyToDispatch"].includes(orderStatus)) return "Processing";
  return "New";
}

export default function StoreOrdersClient() {
  const { canCreate } = useModulePermissions("store_orders");
  const [orders, setOrders] = useState<StoreOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/store-orders?${params.toString()}`);
      const data = await response.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders as StoreOrderRow[]);
        return;
      }
      setOrders([]);
      setError(data.error || "Could not load store orders.");
    } catch {
      setOrders([]);
      setError("Could not load store orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.order_number, order.store_name_snapshot, order.store_code_snapshot, order.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [orders, search]);

  const queueSummary = useMemo(() => {
    const summary: Record<QueueStatus, number> = {
      New: 0,
      Processing: 0,
      Invoiced: 0,
      Completed: 0,
      Cancelled: 0,
    };
    for (const order of orders) {
      summary[queueStatusFor(order.status)] += 1;
    }
    return summary;
  }, [orders]);

  const unreadCount = queueSummary.New;

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Store Orders",
        subtitle: "Order finished goods from stores with a controlled fulfilment workflow.",
        outcomes: [
          "Draft and submit store replenishment orders",
          "Track approval through picking and dispatch",
          "Order lines sourced from finished goods master",
        ],
      }}
      actions={
        canCreate ? (
          <Link
            href="/store-orders/new"
            className={`${VYRON_MASTER.primaryBtn} inline-flex items-center gap-2 px-4 py-2.5 text-sm`}
          >
            <Plus size={16} />
            New Store Order
          </Link>
        ) : null
      }
    >
      <div className="space-y-6">
        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700">
              Sales Orders Queue
              <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-black text-white">{unreadCount}</span>
            </div>
            {(["New", "Processing", "Invoiced", "Completed", "Cancelled"] as QueueStatus[]).map((status) => (
              <div key={status} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#334155]">
                {status}: {queueSummary[status]}
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {["All", ...STORE_ORDER_STATUSES].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    statusFilter === status
                      ? "bg-[#0F172A] text-white"
                      : "border border-[#E2E8F0] bg-white text-[#334155]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="relative min-w-[240px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders"
                className="w-full rounded-xl border border-[#E2E8F0] py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
          </div>

          <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Order Value</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading store orders…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No store orders found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <tr key={order.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                          <ShoppingCart size={16} className="text-[#64748B]" />
                          {order.order_number}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#334155]">
                        <div className="font-semibold">{order.store_name_snapshot || "—"}</div>
                        <div className="text-xs text-[#64748B]">{order.store_code_snapshot || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{order.order_date}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-[#0F172A]">
                        {formatStoreOrderMoney(order.order_value || order.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-[#334155]">
                        {formatStoreOrderMoney(order.gross_margin || 0)}
                        <div className="text-xs text-[#64748B]">{Number(order.margin_pct || 0).toFixed(1)}%</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${storeOrderStatusClass(order.status)}`}
                        >
                          {queueStatusFor(order.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/store-orders/${order.id}`}
                          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold text-[#334155] hover:bg-[#F8FAFC]"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </EnterpriseScrollContainer>
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
