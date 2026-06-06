"use client";

import Link from "next/link";
import type { ComplianceMetric } from "@/lib/vyron-enterprise-platform";

export default function ComplianceCentreClient({ metrics }: { metrics: ComplianceMetric[] }) {
  const avg = metrics.length ? Math.round(metrics.reduce((s, m) => s + m.compliancePct, 0) / metrics.length) : 0;

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-violet-950 p-8 text-white">
        <div className="text-xs font-black uppercase text-violet-300">Overall compliance</div>
        <div className="mt-2 text-5xl font-black">{avg}%</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <Link
            key={m.domain}
            href={m.href}
            className="rounded-[2rem] bg-white p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="text-xs font-black uppercase text-slate-400">{m.domain}</div>
            <div className="mt-2 text-4xl font-black text-slate-950">{m.compliancePct}%</div>
            <div className="mt-2 text-sm font-bold text-slate-600">{m.openIssues} open issue(s)</div>
            <span
              className={`mt-3 inline-block rounded-lg px-2 py-1 text-xs font-black ${
                m.status === "Compliant" ? "bg-emerald-100 text-emerald-800" : m.status === "Watch" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
              }`}
            >
              {m.status}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
