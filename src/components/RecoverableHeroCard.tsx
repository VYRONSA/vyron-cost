import { ArrowUpRight, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/vyron-cost-data";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

export default function RecoverableHeroCard({ kpis }: { kpis: LeakageKpis }) {
  return (
    <section className="mb-6 overflow-hidden rounded-[2.5rem] border border-[#123524]/10 bg-white p-8 shadow-[0_16px_50px_rgba(16,21,17,0.08)] md:p-10">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#ef4444]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#ef4444]">
            <ShieldAlert size={14} />
            Money Being Lost
          </div>
          <div className="mt-6 text-5xl font-black tracking-tight text-[#F8FAFC] md:text-6xl">
            {formatMoney(kpis.moneyAtRisk)}
            <span className="ml-3 text-lg font-black uppercase tracking-[0.2em] text-[#667085]">/ month</span>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#667085]">
            Supplier inflation · invoices · GP · wastage · procurement — detected before month-end.
          </p>
        </div>

        <div className="rounded-[2rem] border border-[#b6d934]/40 bg-[#b6d934]/12 p-7">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#123524]">
            <TrendingUp size={16} />
            Recoverable With VYRON COST
          </div>
          <div className="mt-4 text-4xl font-black text-[#123524] md:text-5xl">{formatMoney(kpis.recoverableAnnual)}</div>
          <div className="mt-2 text-sm font-bold text-[#667085]">
            per year · {formatMoney(kpis.recoverableMonthly)} / month
          </div>
          <Link
            href="/recovery-opportunities"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#b6d934] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#F8FAFC]"
          >
            View Recovery
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
