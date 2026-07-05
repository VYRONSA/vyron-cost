"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, PackageCheck, ShoppingBasket, Truck } from "lucide-react";
import {
  PremiumMobileCard,
  PremiumMobileCardSkeleton,
  PremiumMobileEmptyState,
  PremiumMobileKpiCarousel,
  PremiumMobileModuleTile,
  PremiumMobileRecordCard,
} from "@/components/vyron-mobile/design-system";
import type { PremiumMobileKpiItem } from "@/components/vyron-mobile/design-system/PremiumMobileKpiCarousel";

type ProcurementRequisition = {
  id: string;
  requisition_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  estimated_cost?: number;
};

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_name_snapshot: string | null;
  status: string;
  total: number;
  created_at: string;
};

type GoodsReceipt = {
  id: string;
  grn_number?: string | null;
  supplier_name_snapshot?: string | null;
  received_at?: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value || 0);
}

function toTone(status: string): "draft" | "pending" | "approved" | "completed" | "archived" | "cancelled" | "received" {
  const value = status.toLowerCase();
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("approved") || value.includes("ready")) return "approved";
  if (value.includes("received") || value.includes("complete")) return "received";
  if (value.includes("submitted") || value.includes("sent") || value.includes("partial")) return "pending";
  if (value.includes("archive")) return "archived";
  return "draft";
}

export default function VyronMobileProcurementWorkspace() {
  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState<ProcurementRequisition[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [reqRes, poRes, grRes] = await Promise.all([
          fetch("/api/procurement-requisitions", { credentials: "include" }),
          fetch("/api/purchase-orders", { credentials: "include" }),
          fetch("/api/goods-receipts", { credentials: "include" }),
        ]);

        const [reqJson, poJson, grJson] = await Promise.all([
          reqRes.json().catch(() => ({ ok: false })),
          poRes.json().catch(() => ({ ok: false })),
          grRes.json().catch(() => ({ ok: false })),
        ]);

        if (!active) return;

        setRequisitions(Array.isArray(reqJson.requisitions) ? reqJson.requisitions : []);
        setOrders(Array.isArray(poJson.orders) ? poJson.orders : []);
        setReceipts(Array.isArray(grJson.receipts) ? grJson.receipts : []);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const pendingApprovals = useMemo(
    () => orders.filter((order) => String(order.status || "").toLowerCase() === "submitted").length,
    [orders]
  );

  const openPoValue = useMemo(
    () => orders.filter((order) => !["closed", "cancelled"].includes(String(order.status || "").toLowerCase())).reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders]
  );

  const cards = useMemo<PremiumMobileKpiItem[]>(
    () => [
      {
        id: "pending-approvals",
        label: "Pending Approvals",
        value: String(pendingApprovals),
        note: "Purchase orders waiting for executive action",
        icon: ClipboardList,
        tone: pendingApprovals > 0 ? "pending" : "approved",
      },
      {
        id: "po-value",
        label: "Open PO Value",
        value: formatCurrency(openPoValue),
        note: "Committed purchasing value currently open",
        icon: ShoppingBasket,
        tone: "approved",
      },
      {
        id: "requisition-count",
        label: "Requisitions",
        value: String(requisitions.length),
        note: "Demand signals from inventory and production",
        icon: Truck,
        tone: requisitions.length ? "pending" : "approved",
      },
      {
        id: "goods-receipts",
        label: "Goods Receipts",
        value: String(receipts.length),
        note: "Recent receiving events posted into inventory",
        icon: PackageCheck,
        tone: receipts.length ? "received" : "draft",
      },
    ],
    [openPoValue, pendingApprovals, requisitions.length, receipts.length]
  );

  const recentRecords = useMemo(() => {
    const poRecords = orders.slice(0, 4).map((order) => ({
      id: `po-${order.id}`,
      title: order.po_number || "Purchase Order",
      subtitle: order.supplier_name_snapshot || "Supplier",
      status: order.status || "Draft",
      tone: toTone(order.status || "Draft"),
      href: `/purchase-orders/${order.id}`,
      meta: [
        { label: "Total", value: formatCurrency(Number(order.total || 0)) },
        { label: "Created", value: new Date(order.created_at).toLocaleDateString("en-ZA") },
      ],
    }));

    const reqRecords = requisitions.slice(0, 3).map((req) => ({
      id: `req-${req.id}`,
      title: req.requisition_number || "Requisition",
      subtitle: req.notes || "Procurement requisition",
      status: req.status || "Draft",
      tone: toTone(req.status || "Draft"),
      href: `/procurement/${req.id}`,
      meta: [
        { label: "Est. Cost", value: formatCurrency(Number(req.estimated_cost || 0)) },
        { label: "Created", value: new Date(req.created_at).toLocaleDateString("en-ZA") },
      ],
    }));

    return [...poRecords, ...reqRecords].slice(0, 5);
  }, [orders, requisitions]);

  return (
    <section className="space-y-5 px-4 pb-8 pt-1 sm:px-5">
      <PremiumMobileCard tone="default" className="p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Procurement Workspace</div>
        <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">What Needs Attention</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">Approvals, suppliers, requisitions and receiving in one touch-first flow.</div>
      </PremiumMobileCard>

      <PremiumMobileKpiCarousel title="Procurement Snapshot" items={cards} />

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Procurement Actions</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PremiumMobileModuleTile href="/purchase-orders" title="Purchase Orders" description="Approve and track supplier commitments" icon={ClipboardList} eyebrow="Open" />
          <PremiumMobileModuleTile href="/procurement" title="Requisitions" description="Convert shortages into controlled purchasing" icon={Truck} eyebrow="Open" />
          <PremiumMobileModuleTile href="/goods-receipts" title="Goods Receipts" description="Post incoming stock and reconcile variances" icon={PackageCheck} eyebrow="Open" />
          <PremiumMobileModuleTile href="/suppliers" title="Suppliers" description="Review pricing, lead-times and risk" icon={ShoppingBasket} eyebrow="Open" />
        </div>
      </section>

      <section>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Recent Activity</div>
        {loading ? (
          <div className="space-y-3">
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
          </div>
        ) : recentRecords.length ? (
          <div className="space-y-3">
            {recentRecords.map((record) => (
              <PremiumMobileRecordCard
                key={record.id}
                title={record.title}
                subtitle={record.subtitle}
                icon={record.tone === "received" ? PackageCheck : ClipboardList}
                status={record.status}
                statusTone={record.tone}
                meta={record.meta}
                actions={[
                  { id: `${record.id}-open`, label: "Open", href: record.href, variant: "primary" },
                ]}
              />
            ))}
          </div>
        ) : (
          <PremiumMobileEmptyState
            title="No procurement activity yet"
            description="Your requisitions, orders and receiving events will appear here as soon as they are created."
            icon={Truck}
            primaryAction={{ label: "Create Requisition", href: "/procurement" }}
            secondaryAction={{ label: "Open Purchase Orders", href: "/purchase-orders" }}
          />
        )}
      </section>
    </section>
  );
}
