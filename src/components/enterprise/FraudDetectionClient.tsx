"use client";

import Link from "next/link";
import type { FraudAlert } from "@/lib/vyron-enterprise-platform";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

function sevClass(s: string) {
  if (s === "critical") return "bg-red-100 text-red-800";
  if (s === "high") return "bg-orange-100 text-orange-800";
  return "bg-fuchsia-100 text-fuchsia-800";
}

export default function FraudDetectionClient({ alerts }: { alerts: FraudAlert[] }) {
  const exposure = alerts.reduce((s, a) => s + a.exposure, 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Fraud Detection",
        subtitle: "Premium VYRON COST workflow for fraud detection.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-2xl bg-red-50 p-6">
              <div className="text-xs font-black uppercase text-red-700">Open alert exposure</div>
              <div className="mt-2 text-3xl font-black text-red-900">{money(exposure)}</div>
              <div className="mt-1 text-sm font-bold text-red-700">{alerts.length} active alerts</div>
            </div>
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-[2rem] bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${sevClass(a.severity)}`}>{a.severity}</span>
                      <span className="ml-2 text-[10px] font-black uppercase text-slate-400">{a.alertType.replace(/_/g, " ")}</span>
                      <h3 className="mt-2 font-black text-slate-900">{a.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{a.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-red-600">{money(a.exposure)}</div>
                      {a.href ? (
                        <Link href={a.href} className="text-xs font-black text-violet-700 hover:underline">
                          Investigate →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
