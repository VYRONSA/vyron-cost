import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getAlertRows } from "@/lib/vyron-entity-details";

export default async function AlertsPage() {
  const rows = await getAlertRows();

  return (
    <VyronCostAiShell hidePageHeader title="Alerts" subtitle="High-risk margin, supplier and invoice alerts.">
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Active Alerts</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{rows.length}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Critical</div>
          <div className="mt-3 text-4xl font-black text-red-600">
            {rows.filter((r) => /critical/i.test(r.severity)).length}
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">High</div>
          <div className="mt-3 text-4xl font-black text-fuchsia-600">
            {rows.filter((r) => /high/i.test(r.severity)).length}
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Open</div>
          <div className="mt-3 text-4xl font-black text-violet-700">
            {rows.filter((r) => /open|active|investigate|review|pending/i.test(r.status)).length}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="mb-5 text-xl font-black text-slate-900">Alert queue</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-4 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <div>Alert</div>
            <div>Severity</div>
            <div>Status</div>
            <div>Impact</div>
          </div>
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="grid grid-cols-4 border-t border-slate-100 px-5 py-4 text-sm transition hover:bg-violet-50"
            >
              <div className="font-black text-slate-900">{row.title}</div>
              <div className="font-bold text-red-600">{row.severity}</div>
              <div className="font-bold text-slate-600">{row.status}</div>
              <div className="font-black text-slate-900">{row.impact}</div>
            </Link>
          ))}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
