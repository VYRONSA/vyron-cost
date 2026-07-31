import type { StoreOrderRow } from "@/lib/vyron-store-orders";
import { storeOrderStatusLabel } from "@/lib/vyron-store-orders";

export function storeOrderStatusClass(status: string) {
  switch (status) {
    case "Draft":
      return "bg-slate-100 text-slate-700";
    case "Submitted":
      return "bg-fuchsia-100 text-fuchsia-800";
    case "Approved":
      return "bg-sky-100 text-sky-800";
    case "Picking":
      return "bg-violet-100 text-violet-800";
    case "ReadyToDispatch":
      return "bg-cyan-100 text-cyan-800";
    case "Dispatched":
      return "bg-indigo-100 text-indigo-800";
    case "Delivered":
      return "bg-violet-100 text-violet-800";
    case "Cancelled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function formatStoreOrderMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function storeOrderDeliveryDate(order: StoreOrderRow) {
  return order.required_date || order.order_date;
}

export function renderStoreOrderStatus(status: string) {
  return storeOrderStatusLabel(status);
}
