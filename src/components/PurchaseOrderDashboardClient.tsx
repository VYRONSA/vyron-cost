"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, PackageCheck, AlertTriangle, Truck, Archive } from "lucide-react";

type Stats = {
  openPos: number;
  pendingApproval: number;
  partiallyReceived: number;
  closedPos: number;
  backOrders: number;
  poVariances: number;
};

export default function PurchaseOrderDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/procurement/stats")
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

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-[2rem] border border-violet-100 bg-white p-6 shadow-[0_18px_60px_rgba(76,29,149,0.08)] transition hover:border-violet-300"
          >
            <card.icon className="text-violet-600" size={28} />
            <div className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{card.label}</div>
            <div className="mt-2 text-4xl font-black text-slate-950">{card.value ?? "…"}</div>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/purchase-orders/new" className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white">
          New Purchase Order
        </Link>
        <Link href="/goods-receipts" className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">
          GRN Dashboard
        </Link>
        <Link href="/goods-receipts/new" className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-800">
          New GRN
        </Link>
        <Link href="/purchase-orders/settings" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
          PO Approval Settings
        </Link>
      </div>
    </section>
  );
}
