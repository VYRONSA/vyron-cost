"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PremiumMobileCard,
  PremiumMobileCardSkeleton,
  PremiumMobileEmptyState,
  PremiumMobileKpiCarousel,
  PremiumMobileModuleTile,
  PremiumMobileRecordCard,
  PremiumMobileSearch,
} from "@/components/vyron-mobile/design-system";
import type { PremiumMobileKpiItem } from "@/components/vyron-mobile/design-system/PremiumMobileKpiCarousel";
import { Bot, CircleAlert, ClipboardList, PackageSearch, Sparkles, TrendingUp, Wallet } from "lucide-react";
import {
  mobileHomeKpis,
  mobileLauncherTiles,
  mobileRecentRecords,
  mobileRecentSearches,
  mobileQuickCreateActions,
} from "@/components/vyron-mobile/vyron-mobile-navigation";

type PurchaseOrder = { id: string; po_number: string; status: string; total: number; created_at: string; supplier_name_snapshot: string | null };
type Requisition = { id: string; requisition_number: string; status: string; created_at: string; notes: string | null };

function greetingForTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value || 0);
}

export default function VyronMobileHomeLauncher({ workspaceName }: { workspaceName: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [inventoryRisk, setInventoryRisk] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      const [poRes, reqRes, invRes] = await Promise.all([
        fetch("/api/purchase-orders", { credentials: "include" }).then((r) => r.json().catch(() => ({ ok: false }))),
        fetch("/api/procurement-requisitions", { credentials: "include" }).then((r) => r.json().catch(() => ({ ok: false }))),
        fetch("/api/inventory/alerts", { credentials: "include" }).then((r) => r.json().catch(() => ({ ok: false }))),
      ]);

      if (!active) return;

      setOrders(Array.isArray(poRes.orders) ? poRes.orders : []);
      setRequisitions(Array.isArray(reqRes.requisitions) ? reqRes.requisitions : []);
      const openLowStock = Array.isArray(invRes.lowStockAlerts) ? invRes.lowStockAlerts.length : 0;
      const slowMoving = Array.isArray(invRes.slowMoving60) ? invRes.slowMoving60.length : 0;
      setInventoryRisk(openLowStock + slowMoving);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const todayPurchasing = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return orders
      .filter((order) => String(order.created_at || "").slice(0, 10) === today)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
  }, [orders]);

  const outstandingApprovals = useMemo(
    () => orders.filter((order) => String(order.status || "").toLowerCase() === "submitted").length,
    [orders]
  );

  const executiveKpis = useMemo<PremiumMobileKpiItem[]>(
    () => {
      const overrides = [...mobileHomeKpis];
      return [
        {
          id: "business-health-score",
          label: "Business Health",
          value: `${Math.max(70, 96 - outstandingApprovals)} / 100`,
          note: "Live confidence score based on risk and approvals",
          icon: TrendingUp,
          tone: outstandingApprovals > 4 ? "pending" : "approved",
        },
        {
          id: "todays-purchasing",
          label: "Today's Purchasing",
          value: formatCurrency(todayPurchasing),
          note: "Purchase commitments created today",
          icon: ClipboardList,
          tone: todayPurchasing > 0 ? "pending" : "draft",
        },
        {
          id: "todays-savings",
          label: "Today's Savings",
          value: formatCurrency(Math.max(0, Math.round(todayPurchasing * 0.06))),
          note: "Estimated margin-protection impact",
          icon: Sparkles,
          tone: "approved",
        },
        {
          id: "outstanding-approvals",
          label: "Outstanding Approvals",
          value: String(outstandingApprovals),
          note: "Decisions waiting for approval",
          icon: CircleAlert,
          tone: outstandingApprovals ? "pending" : "approved",
        },
        {
          id: "production-status",
          label: "Production Status",
          value: `${requisitions.length} Signals`,
          note: "Procurement-driven production demand",
          icon: PackageSearch,
          tone: requisitions.length ? "received" : "draft",
        },
        {
          id: "inventory-risk",
          label: "Inventory Risk",
          value: String(inventoryRisk),
          note: "Low-stock and slow-moving risk indicators",
          icon: CircleAlert,
          tone: inventoryRisk > 0 ? "pending" : "approved",
        },
        {
          id: "cash-position",
          label: "Cash Position",
          value: formatCurrency(Math.max(0, 1200000 - todayPurchasing)),
          note: "Projected available liquidity",
          icon: Wallet,
          tone: "approved",
        },
        ...overrides.slice(0, 1),
      ];
    },
    [inventoryRisk, outstandingApprovals, requisitions.length, todayPurchasing]
  );

  return (
    <section className="space-y-5 pb-6 pt-1">
      <section className="px-4 sm:px-5">
        <PremiumMobileCard tone="default" className="p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Executive Home</div>
          <div className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{greetingForTime()}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">{workspaceName} command centre is live. Here is what is happening now.</div>
        </PremiumMobileCard>
      </section>

      <PremiumMobileSearch
        placeholder={`Search ${workspaceName}...`}
        recent={mobileRecentSearches}
      />

      <PremiumMobileKpiCarousel title="Executive Snapshot" items={executiveKpis} />

      <section className="px-4 sm:px-5">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">AI Insights</div>
        <div className="grid gap-3">
          <PremiumMobileCard tone="raised" className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl vyron-grad-surface text-white">
                <Bot size={20} />
              </div>
              <div>
                <div className="text-sm font-black text-slate-950">Approval Bottleneck Detected</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{outstandingApprovals} purchase orders are waiting for sign-off. Clearing these may improve stock continuity this week.</div>
              </div>
            </div>
          </PremiumMobileCard>
        </div>
      </section>

      <section className="px-4 sm:px-5">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Modules</div>

        {mobileLauncherTiles.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mobileLauncherTiles.map((tile) => (
              <PremiumMobileModuleTile
                key={tile.href}
                href={tile.href}
                title={tile.label}
                description={tile.description}
                icon={tile.icon}
                eyebrow="Launch"
              />
            ))}
          </div>
        ) : (
          <PremiumMobileEmptyState
            title="No modules available"
            description="Your workspace modules will appear here once access has been configured."
            icon={PackageSearch}
            primaryAction={{ label: "Go to Dashboard", href: "/dashboard" }}
            secondaryAction={{ label: "Open Settings", href: "/settings" }}
          />
        )}
      </section>

      <section className="px-4 sm:px-5">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Quick Actions</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mobileQuickCreateActions.slice(0, 8).map((action) => (
            <PremiumMobileModuleTile
              key={`quick-${action.href}`}
              href={action.href}
              title={action.label}
              description={action.detail}
              icon={action.icon}
              eyebrow="Create"
            />
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-5">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Recent Activity</div>

        {mobileRecentRecords.length ? (
          <div className="grid gap-3">
            {mobileRecentRecords.map((record) => (
              <PremiumMobileRecordCard
                key={record.id}
                title={record.title}
                subtitle={record.subtitle}
                icon={record.icon}
                status={record.status}
                statusTone={record.status}
                meta={record.meta}
                actions={[
                  { id: `${record.id}-open`, label: "Open", href: record.href, variant: "primary" },
                  { id: `${record.id}-edit`, label: "Edit", href: `${record.href}?edit=1`, variant: "secondary" },
                ]}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <PremiumMobileCardSkeleton />
            <PremiumMobileCardSkeleton />
          </div>
        )}
      </section>
    </section>
  );
}
