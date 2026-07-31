"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, PackageCheck, AlertTriangle, Truck, Archive } from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import {
  VyronPremiumMetricCard,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";
import { VYRON_DOMAIN_QUOTES } from "@/components/vyron-premium/VyronPremiumTheme";

type Stats = {
  openPos: number;
  pendingApproval: number;
  partiallyReceived: number;
  closedPos: number;
  backOrders: number;
  poVariances: number;
};

const procurementQuotes = VYRON_DOMAIN_QUOTES.procurement;

export default function PurchaseOrderDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/procurement/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setStats(d.stats);
      })
      .catch(() => setStats(null));
  }, []);

  const cards = [
    { label: "Open POs", value: stats?.openPos, icon: ClipboardList, href: "/purchase-orders/list" },
    { label: "Pending Approval", value: stats?.pendingApproval, icon: AlertTriangle, href: "/purchase-orders/approvals" },
    { label: "Partially Received", value: stats?.partiallyReceived, icon: Truck, href: "/purchase-orders/list?status=Partially Received" },
    { label: "Closed POs", value: stats?.closedPos, icon: Archive, href: "/purchase-orders/list?status=Closed" },
    { label: "Back Orders", value: stats?.backOrders, icon: PackageCheck, href: "/purchase-orders/back-orders" },
    { label: "PO Variances", value: stats?.poVariances, icon: AlertTriangle, href: "/purchase-orders/list" },
  ];

  const actions = (
    <>
      <Link href="/purchase-orders/new" className="rounded-xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-3 text-sm font-semibold text-[#F8FAFC]">
        + New Purchase Order
      </Link>
      <Link href="/goods-receipts" className="rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#F8FAFC]">
        GRN Dashboard
      </Link>
      <Link href="/goods-receipts/new" className="rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#CBD5E1]">
        New GRN
      </Link>
      <Link href="/purchase-orders/settings" className="rounded-xl border border-white/10 bg-[#21163A] px-5 py-3 text-sm font-semibold text-[#CBD5E1]">
        PO Approval Settings
      </Link>
    </>
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "procurement",
        badge: "Premium Procurement Workspace",
        title: "Purchase Order Control",
        subtitle: "Procurement control — PO lifecycle, GRN and 3-way matching.",
        outcomes: ["Control costs", "Approve POs", "Match GRNs", "Reduce risk"],
        quotes: procurementQuotes,
        controlTitle: "Purchase Order Control",
        formulaEyebrow: "3-way match",
        formulaTitle: "Procurement reconciliation",
        intelligenceEyebrow: "Procurement signals",
        intelligenceTitle: "What to watch",
        formulas: [
          { label: "PO Total", formula: "Σ ordered qty × unit price" },
          { label: "GRN Total", formula: "Σ received qty × PO unit cost" },
          { label: "Invoice Variance", formula: "Supplier invoice − GRN value" },
        ],
      }}
      actions={actions}
    >
      <VyronPremiumSectionHeading eyebrow="Live metrics" title="Live Procurement Snapshot" subtitle="Open POs, approvals, receipts and variances at a glance." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <VyronPremiumMetricCard key={card.label} label={card.label} value={card.value ?? "…"} href={card.href} icon={<card.icon size={24} />} />
        ))}
      </div>
    </VyronPremiumPageShell>
  );
}
