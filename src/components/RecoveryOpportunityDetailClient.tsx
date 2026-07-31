"use client";

import { CheckCircle2, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import type { RecoveryOpportunityDetail } from "@/lib/vyron-recovery-detail";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function RecoveryOpportunityDetailClient({
  detail: initial,
}: {
  detail: RecoveryOpportunityDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [message, setMessage] = useState("");

  function setStatus(status: string) {
    setDetail((current) => ({ ...current, status }));
    setMessage(`Opportunity marked as ${status}.`);
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        title: "Recovery Opportunity Detail",
        subtitle: "Premium VYRON COST workflow for recovery opportunity detail.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{detail.category}</div>
                <h2 className="mt-2 text-3xl font-black text-[#F8FAFC]">{detail.opportunity}</h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">{detail.whyDetected}</p>
              </div>

              <div className="rounded-[2rem] border border-[#A855F7]/25 bg-[#A855F7]/10 p-6">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#4D7C0F]">Formula used</div>
                <div className="mt-2 text-lg font-black text-[#F8FAFC]">{detail.formulaName}</div>
                <div className="mt-4 rounded-xl bg-white p-4 font-mono text-sm font-bold text-slate-800">
                  {detail.formulaExpression}
                </div>
                <div className="mt-3 text-sm font-bold text-[#4D7C0F]">{detail.formulaWorkedExample}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-400">Monthly value</div>
                    <div className="mt-1 text-2xl font-black text-[#7E22CE]">{formatMoney(detail.monthly_saving)}</div>
                  </div>
                  <div className="rounded-xl bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-400">Annual value</div>
                    <div className="mt-1 text-2xl font-black text-[#7E22CE]">{formatMoney(detail.annual_saving)}</div>
                    <div className="mt-1 text-xs text-slate-500">= monthly × 12</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black text-[#F8FAFC]">Products affected</h3>
                {detail.productsAffected.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm font-bold text-slate-500">
                    No direct product mapping for this opportunity type.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {detail.productsAffected.map((product) => (
                      <Link
                        key={product.id}
                        href={product.href}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 transition hover:bg-[#A855F7]/10"
                      >
                        <span className="font-black text-[#F8FAFC]">{product.name}</span>
                        <span className="text-xs font-bold text-slate-500">{product.impact}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black text-[#F8FAFC]">Suppliers affected</h3>
                {detail.suppliersAffected.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-sm font-bold text-slate-500">
                    No linked suppliers for this opportunity.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {detail.suppliersAffected.map((supplier) => (
                      <Link
                        key={supplier.id}
                        href={supplier.href}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 transition hover:bg-[#A855F7]/10"
                      >
                        <span className="font-black text-[#F8FAFC]">{supplier.name}</span>
                        <span className="text-xs font-bold text-slate-500">{supplier.impact}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[2rem] bg-[#08111A] p-6 text-white">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#B6D934]">Potential recovery</div>
                <div className="mt-3 text-4xl font-black text-[#A855F7]">{formatMoney(detail.annual_saving)}</div>
                <div className="mt-2 text-sm text-white/60">per year · {detail.confidencePercent}% confidence</div>
                <div className="mt-4 rounded-xl bg-white/10 p-4 text-sm">
                  <div className="font-black text-[#B6D934]">Data source</div>
                  <div className="mt-2 text-white/80">{detail.dataSource}</div>
                </div>
                <div className="mt-4 rounded-xl bg-white/10 p-4 text-sm">
                  <div className="font-black text-[#B6D934]">Recommended action</div>
                  <div className="mt-2 text-white/80">{detail.recommendedAction}</div>
                </div>
                <div className="mt-4 text-sm font-bold">Status: {detail.status}</div>
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Actions</h3>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus("Approved")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-transparent vyron-grad-surface px-4 py-3 text-sm font-black text-[#F8FAFC]"
                  >
                    <CheckCircle2 size={16} />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("Investigating")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-100 px-4 py-3 text-sm font-black text-fuchsia-900"
                  >
                    <Search size={16} />
                    Mark as Investigating
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("Rejected")}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/recovery-opportunities")}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
                  >
                    Back to list
                  </button>
                </div>
                {message ? (
                  <div className="mt-4 rounded-xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-black text-[#7E22CE]">{message}</div>
                ) : null}
              </div>
            </aside>
          </section>
    </VyronPremiumPageShell>
  );
}
