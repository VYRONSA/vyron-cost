"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, PackageCheck, ShieldCheck, TimerReset, Truck } from "lucide-react";
import {
  PremiumMobileCard,
  PremiumMobileCardSkeleton,
  PremiumMobileEmptyState,
  PremiumMobileKpiCarousel,
  PremiumMobileRecordCard,
  PremiumMobileSearch,
} from "@/components/vyron-mobile/design-system";
import type { PremiumMobileKpiItem } from "@/components/vyron-mobile/design-system/PremiumMobileKpiCarousel";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  total: number;
  order_date: string | null;
  created_at: string;
  expected_date?: string | null;
};

type PurchaseOrderDetail = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  order_date: string | null;
  notes: string | null;
  total: number;
  subtotal: number;
  vat_amount: number;
  variance: number;
  lines: Array<{ id: string; item_name: string; quantity: number; unit: string; line_total: number; outstanding_qty: number }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value || 0);
}

function statusTone(status: string): "draft" | "pending" | "approved" | "completed" | "archived" | "cancelled" | "received" {
  const value = String(status || "").toLowerCase();
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("approved")) return "approved";
  if (value.includes("received")) return "received";
  if (value.includes("closed")) return "completed";
  if (value.includes("submitted") || value.includes("sent") || value.includes("partial")) return "pending";
  return "draft";
}

function priorityFromOrder(total: number) {
  if (total >= 200000) return "High";
  if (total >= 60000) return "Medium";
  return "Normal";
}

export default function VyronMobilePurchaseOrdersWorkspace() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderDetail | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { query } = poApiWorkspaceContext();
        const response = await fetch(`/api/purchase-orders${query}`, { credentials: "include" });
        const json = await response.json().catch(() => ({ ok: false }));
        if (!active) return;
        const rows = Array.isArray(json.orders) ? (json.orders as PurchaseOrder[]) : [];
        setOrders(rows);
        if (rows.length && !selectedOrderId) setSelectedOrderId(rows[0].id);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSelectedDetail() {
      if (!selectedOrderId) {
        setSelectedOrder(null);
        return;
      }
      const { query } = poApiWorkspaceContext();
      const response = await fetch(`/api/purchase-orders/${selectedOrderId}${query}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({ ok: false }));
      if (!active) return;
      if (json.ok) setSelectedOrder(json.purchaseOrder as PurchaseOrderDetail);
    }
    void loadSelectedDetail();
    return () => {
      active = false;
    };
  }, [selectedOrderId]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.po_number, order.supplier_name_snapshot, order.status].join(" ").toLowerCase().includes(term)
    );
  }, [orders, search]);

  const approvalsCount = useMemo(
    () => orders.filter((order) => String(order.status || "").toLowerCase() === "submitted").length,
    [orders]
  );

  const awaitingGoodsReceipts = useMemo(
    () =>
      orders.filter((order) => {
        const status = String(order.status || "").toLowerCase();
        return ["approved", "sent", "partially received", "submitted"].includes(status);
      }).length,
    [orders]
  );

  const lateDeliveries = useMemo(
    () =>
      orders.filter((order) => {
        const dueDate = order.expected_date || order.order_date || "";
        const status = String(order.status || "").toLowerCase();
        return Boolean(dueDate) && dueDate < todayIso && !status.includes("received") && !status.includes("closed") && !status.includes("cancelled");
      }).length,
    [orders, todayIso]
  );

  const urgentOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = String(order.status || "").toLowerCase();
        return Number(order.total || 0) >= 200000 && !status.includes("received") && !status.includes("closed");
      }).length,
    [orders]
  );

  const todaysPurchasing = useMemo(
    () =>
      orders
        .filter((order) => String(order.created_at || "").slice(0, 10) === todayIso)
        .reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders, todayIso]
  );

  const supplierAlerts = useMemo(() => {
    const bySupplier = new Map<string, { late: number; open: number }>();
    for (const order of orders) {
      const supplier = String(order.supplier_name_snapshot || "Unknown Supplier");
      const dueDate = order.expected_date || order.order_date || "";
      const status = String(order.status || "").toLowerCase();
      const current = bySupplier.get(supplier) || { late: 0, open: 0 };
      if (!status.includes("received") && !status.includes("closed") && !status.includes("cancelled")) {
        current.open += 1;
      }
      if (dueDate && dueDate < todayIso && !status.includes("received") && !status.includes("closed") && !status.includes("cancelled")) {
        current.late += 1;
      }
      bySupplier.set(supplier, current);
    }
    return Array.from(bySupplier.entries())
      .filter(([, value]) => value.late > 0 || value.open >= 3)
      .sort((a, b) => b[1].late - a[1].late || b[1].open - a[1].open)
      .slice(0, 4)
      .map(([supplier, value]) => ({ supplier, ...value }));
  }, [orders, todayIso]);

  const recentActivity = useMemo(
    () =>
      [...orders]
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .slice(0, 5)
        .map((order) => ({
          id: order.id,
          title: order.po_number,
          detail: `${order.status} · ${formatCurrency(Number(order.total || 0))} · ${new Date(order.created_at).toLocaleDateString("en-ZA")}`,
        })),
    [orders]
  );

  const totalOpenValue = useMemo(
    () => orders.filter((order) => !["closed", "cancelled"].includes(String(order.status || "").toLowerCase())).reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders]
  );

  const kpis = useMemo<PremiumMobileKpiItem[]>(
    () => [
      {
        id: "po-open",
        label: "Open Purchase Orders",
        value: String(orders.length),
        note: "All current purchasing records",
        icon: ClipboardList,
        tone: orders.length ? "pending" : "draft",
      },
      {
        id: "po-approvals",
        label: "Approval Queue",
        value: String(approvalsCount),
        note: "Orders requiring management sign-off",
        icon: ShieldCheck,
        tone: approvalsCount ? "pending" : "approved",
      },
      {
        id: "po-late",
        label: "Late Deliveries",
        value: String(lateDeliveries),
        note: "Expected date passed without closure",
        icon: TimerReset,
        tone: lateDeliveries ? "cancelled" : "approved",
      },
      {
        id: "po-urgent",
        label: "Urgent Purchase Orders",
        value: String(urgentOrders),
        note: "High value open commitments",
        icon: AlertTriangle,
        tone: urgentOrders ? "pending" : "draft",
      },
      {
        id: "po-today",
        label: "Today's Purchasing",
        value: formatCurrency(todaysPurchasing),
        note: "Created today",
        icon: Truck,
        tone: "received",
      },
      {
        id: "po-awaiting-grn",
        label: "Awaiting Goods Receipts",
        value: String(awaitingGoodsReceipts),
        note: "POs ready for GRN",
        icon: PackageCheck,
        tone: awaitingGoodsReceipts ? "pending" : "approved",
      },
      {
        id: "po-value",
        label: "Open Value",
        value: formatCurrency(totalOpenValue),
        note: "Committed procurement spend",
        icon: ClipboardList,
        tone: "approved",
      },
    ],
    [approvalsCount, awaitingGoodsReceipts, lateDeliveries, orders.length, todaysPurchasing, totalOpenValue, urgentOrders]
  );

  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-5">
      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Purchase Orders</div>
        <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Executive Order Control</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">Supplier commitments, approvals and receiving readiness in one mobile flow.</div>
      </PremiumMobileCard>

      <div className="grid gap-3 md:grid-cols-4">
        <PremiumMobileCard tone="raised" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending Approvals</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{approvalsCount}</div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="raised" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Late Deliveries</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{lateDeliveries}</div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="raised" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Urgent Purchase Orders</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{urgentOrders}</div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="raised" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Today's Purchasing</div>
          <div className="mt-2 text-xl font-black text-slate-950">{formatCurrency(todaysPurchasing)}</div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileSearch
        placeholder="Search PO number, supplier, status"
        value={search}
        onChange={setSearch}
        recent={["Submitted orders", "High priority", "Expected today"]}
        onRecentSelect={setSearch}
      />

      <PremiumMobileKpiCarousel title="PO Snapshot" items={kpis} />

      <div className="grid gap-3 md:grid-cols-2">
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Activity</div>
          <div className="mt-3 space-y-2">
            {recentActivity.length ? (
              recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-black text-slate-950">{activity.title}</div>
                  <div className="text-xs font-semibold text-slate-500">{activity.detail}</div>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-slate-500">No activity yet.</p>
            )}
          </div>
        </PremiumMobileCard>
        <PremiumMobileCard tone="default" className="p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Supplier Alerts</div>
          <div className="mt-3 space-y-2">
            {supplierAlerts.length ? (
              supplierAlerts.map((alert) => (
                <div key={alert.supplier} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-sm font-black text-slate-950">{alert.supplier}</div>
                  <div className="text-xs font-semibold text-amber-800">Late deliveries: {alert.late} · Outstanding orders: {alert.open}</div>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-slate-500">No supplier alerts detected.</p>
            )}
          </div>
        </PremiumMobileCard>
      </div>

      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quick Actions</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          <a href="/purchase-orders/new" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">Create Purchase Order</a>
          <a href="/purchase-orders/approvals" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">Pending Approvals</a>
          <a href="/goods-receipts/new" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">Receive Goods</a>
          <a href="/document-intelligence" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">Supplier Invoices</a>
        </div>
      </PremiumMobileCard>

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Purchase Order Records</div>

        {loading ? (
          <div className="space-y-3">
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
          </div>
        ) : filteredOrders.length ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-3">
              {filteredOrders.slice(0, 30).map((order) => {
                const createdDate = order.created_at || order.order_date || "";
                const expectedDelivery = order.expected_date || order.order_date || order.created_at;
                const total = Number(order.total || 0);
                const priority = priorityFromOrder(total);

                return (
                  <div key={order.id} onClick={() => setSelectedOrderId(order.id)} className="cursor-pointer">
                    <PremiumMobileRecordCard
                      title={order.po_number || "Purchase Order"}
                      subtitle={order.supplier_name_snapshot || "Supplier"}
                      icon={ClipboardList}
                      status={order.status || "Draft"}
                      statusTone={statusTone(order.status || "Draft")}
                      meta={[
                        { label: "Total", value: formatCurrency(total) },
                        { label: "Created", value: createdDate ? new Date(createdDate).toLocaleDateString("en-ZA") : "-" },
                        { label: "Expected", value: expectedDelivery ? new Date(expectedDelivery).toLocaleDateString("en-ZA") : "-" },
                        { label: "Priority", value: priority },
                        { label: "Approval", value: order.status || "Draft" },
                        { label: "Supplier", value: order.supplier_name_snapshot || "-" },
                      ]}
                      actions={[
                        { id: `${order.id}-open`, label: "Open", href: `/purchase-orders/${order.id}`, variant: "primary" },
                        { id: `${order.id}-edit`, label: "Edit", href: `/purchase-orders/${order.id}/edit`, variant: "secondary" },
                      ]}
                    />
                  </div>
                );
              })}
            </div>

            <aside className="hidden md:block">
              <PremiumMobileCard tone="default" className="sticky top-4 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Tablet Detail Workspace</div>
                {selectedOrder ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-lg font-black text-slate-950">{selectedOrder.po_number}</div>
                      <div className="text-sm font-semibold text-slate-600">{selectedOrder.supplier_name_snapshot || "Supplier"}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <div className="rounded-xl border border-slate-200 px-3 py-2">Status: <span className="font-black text-slate-950">{selectedOrder.status}</span></div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">Date: <span className="font-black text-slate-950">{selectedOrder.order_date || "-"}</span></div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">Total: <span className="font-black text-slate-950">{formatCurrency(Number(selectedOrder.total || 0))}</span></div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">VAT: <span className="font-black text-slate-950">{formatCurrency(Number(selectedOrder.vat_amount || 0))}</span></div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">Variance: <span className="font-black text-slate-950">{formatCurrency(Number(selectedOrder.variance || 0))}</span></div>
                      <div className="rounded-xl border border-slate-200 px-3 py-2">Outstanding Lines: <span className="font-black text-slate-950">{selectedOrder.lines.filter((line) => Number(line.outstanding_qty || 0) > 0).length}</span></div>
                    </div>
                    <div className="space-y-2">
                      {selectedOrder.lines.slice(0, 5).map((line) => (
                        <div key={line.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                          <div className="font-black text-slate-950">{line.item_name}</div>
                          <div>{line.quantity} {line.unit} · {formatCurrency(Number(line.line_total || 0))}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-black">
                      <a href={`/purchase-orders/${selectedOrder.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-center text-slate-700">Open Detail</a>
                      <a href={`/purchase-orders/${selectedOrder.id}/edit`} className="rounded-xl border border-slate-200 px-3 py-2 text-center text-slate-700">Edit</a>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-slate-500">Select a purchase order to preview details.</p>
                )}
              </PremiumMobileCard>
            </aside>
          </div>
        ) : (
          <PremiumMobileEmptyState
            title="No purchase orders found"
            description="Try another search or create a new purchase order to start procurement execution."
            icon={ClipboardList}
            primaryAction={{ label: "Create Purchase Order", href: "/purchase-orders/new" }}
            secondaryAction={{ label: "Open Requisitions", href: "/procurement" }}
          />
        )}
      </section>
    </section>
  );
}
