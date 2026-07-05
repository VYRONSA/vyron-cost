"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ShieldCheck } from "lucide-react";
import {
  PremiumMobileCard,
  PremiumMobileCardSkeleton,
  PremiumMobileEmptyState,
  PremiumMobileKpiCarousel,
  PremiumMobileRecordCard,
  PremiumMobileSearch,
} from "@/components/vyron-mobile/design-system";
import type { PremiumMobileKpiItem } from "@/components/vyron-mobile/design-system/PremiumMobileKpiCarousel";

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  total: number;
  order_date: string | null;
  created_at: string;
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/purchase-orders", { credentials: "include" });
        const json = await response.json().catch(() => ({ ok: false }));
        if (!active) return;
        setOrders(Array.isArray(json.orders) ? json.orders : []);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

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
        id: "po-value",
        label: "Open Value",
        value: formatCurrency(totalOpenValue),
        note: "Committed procurement spend",
        icon: ClipboardList,
        tone: "approved",
      },
    ],
    [approvalsCount, orders.length, totalOpenValue]
  );

  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-5">
      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Purchase Orders</div>
        <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Executive Order Control</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">Supplier commitments, approvals and receiving readiness in one mobile flow.</div>
      </PremiumMobileCard>

      <PremiumMobileSearch
        placeholder="Search PO number, supplier, status"
        value={search}
        onChange={setSearch}
        recent={["Submitted orders", "High priority", "Expected today"]}
        onRecentSelect={setSearch}
      />

      <PremiumMobileKpiCarousel title="PO Snapshot" items={kpis} />

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Purchase Order Records</div>

        {loading ? (
          <div className="space-y-3">
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
          </div>
        ) : filteredOrders.length ? (
          <div className="space-y-3">
            {filteredOrders.slice(0, 30).map((order) => {
              const createdDate = order.created_at || order.order_date || "";
              const expectedDelivery = order.order_date || order.created_at;
              const total = Number(order.total || 0);
              const priority = priorityFromOrder(total);

              return (
                <PremiumMobileRecordCard
                  key={order.id}
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
              );
            })}
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
