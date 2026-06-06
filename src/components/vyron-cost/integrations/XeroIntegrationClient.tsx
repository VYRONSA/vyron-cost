"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, Link2, RefreshCcw, Settings, UploadCloud } from "lucide-react";

export default function XeroIntegrationClient() {
  const [connected, setConnected] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    fetch("/api/integrations/xero/connection")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setConnected(Boolean(d.connection?.connected));
      })
      .catch(() => {});
    fetch("/api/integrations/xero/sync-queue")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) setQueueCount(d.items.filter((i: { status: string }) => i.status === "Ready").length);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          title="Connection"
          value={connected ? "Connected" : "Not Connected"}
          note="Configure OAuth and organisation link"
          href="/integrations/xero/setup"
          icon={<Link2 size={22} />}
        />
        <Card
          title="Ready to Sync"
          value={String(queueCount)}
          note="Approved transactions in queue"
          href="/integrations/xero/sync-centre"
          icon={<UploadCloud size={22} />}
        />
        <Card
          title="Account Mapping"
          value="Per workspace"
          note="Sales, COGS, inventory and VAT accounts"
          href="/integrations/xero/setup"
          icon={<Settings size={22} />}
        />
      </div>

      <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-8 text-white">
        <h2 className="text-2xl font-black">VYRON COST → Xero</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
          VYRON COST is the operational intelligence layer — costing, inventory, manufacturing and recovery. Xero is the
          accounting ledger. Approved customer invoices and supplier bills are queued here and posted to Xero after review.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/integrations/xero/setup" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">
            Open Xero Setup
          </Link>
          <Link href="/integrations/xero/sync-centre" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white">
            Open Sync Centre
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-black text-white"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h3 className="text-lg font-black text-slate-950">Supported sync types</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["Customer", "Supplier", "Customer Invoice", "Supplier Bill", "Item", "Purchase Order"].map((type) => (
            <div key={type} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
              {type}
            </div>
          ))}
        </div>
        <Link href="/integrations/xero/sync-centre" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-violet-700">
          View sync queue <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

function Card({
  title,
  value,
  note,
  href,
  icon,
}: {
  title: string;
  value: string;
  note: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} className="rounded-[1.75rem] border border-violet-100 bg-white p-5 shadow-sm transition hover:border-violet-300">
      <div className="text-violet-700">{icon}</div>
      <div className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{title}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
    </Link>
  );
}
