"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { VYRON_TABLE } from "@/components/vyron-ui";
import type { StoreOrderRow } from "@/lib/vyron-store-orders";
import {
  formatStoreOrderMoney,
  renderStoreOrderStatus,
  storeOrderDeliveryDate,
  storeOrderStatusClass,
} from "@/components/vyron-cost/store-ordering/store-order-ui";

export type StoreOrderQueueColumn = "order" | "store" | "deliveryDate" | "status" | "total" | "actions";

type Props = {
  orders: StoreOrderRow[];
  loading: boolean;
  columns: StoreOrderQueueColumn[];
  emptyMessage: string;
  renderActions: (order: StoreOrderRow) => ReactNode;
};

const COLUMN_HEADERS: Record<StoreOrderQueueColumn, string> = {
  order: "Order Number",
  store: "Store",
  deliveryDate: "Delivery Date",
  status: "Status",
  total: "Total",
  actions: "Actions",
};

export default function StoreOrderQueueTable({
  orders,
  loading,
  columns,
  emptyMessage,
  renderActions,
}: Props) {
  return (
    <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
      <table className="min-w-full">
        <thead className={VYRON_TABLE.head}>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className={`px-4 py-3 ${column === "total" ? "text-right" : "text-left"}`}
              >
                {COLUMN_HEADERS[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                Loading orders…
              </td>
            </tr>
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr key={order.id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                {columns.map((column) => {
                  if (column === "order") {
                    return (
                      <td key={column} className="px-4 py-3">
                        <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                          <ShoppingCart size={16} className="text-[#64748B]" />
                          {order.order_number}
                        </div>
                      </td>
                    );
                  }
                  if (column === "store") {
                    return (
                      <td key={column} className="px-4 py-3 text-sm text-[#334155]">
                        <div className="font-semibold">{order.store_name_snapshot || "—"}</div>
                        <div className="text-xs text-[#64748B]">{order.store_code_snapshot || "—"}</div>
                      </td>
                    );
                  }
                  if (column === "deliveryDate") {
                    return (
                      <td key={column} className="px-4 py-3 text-sm text-[#64748B]">
                        {storeOrderDeliveryDate(order)}
                      </td>
                    );
                  }
                  if (column === "status") {
                    return (
                      <td key={column} className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${storeOrderStatusClass(order.status)}`}
                        >
                          {renderStoreOrderStatus(order.status)}
                        </span>
                      </td>
                    );
                  }
                  if (column === "total") {
                    return (
                      <td key={column} className="px-4 py-3 text-right text-sm font-bold text-[#0F172A]">
                        {formatStoreOrderMoney(order.total)}
                      </td>
                    );
                  }
                  return (
                    <td key={column} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {renderActions(order)}
                        <Link
                          href={`/store-orders/${order.id}`}
                          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold text-[#334155] hover:bg-[#F8FAFC]"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </EnterpriseScrollContainer>
  );
}
