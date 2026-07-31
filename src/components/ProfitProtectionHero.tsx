import Link from "next/link";
import VyronSurfaceCard, { formatCompactAnnual, formatExecutiveMoney } from "@/components/VyronSurfaceCard";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

export default function ProfitProtectionHero({ kpis }: { kpis: LeakageKpis }) {
  return (
    <VyronSurfaceCard elevated accent className="h-full p-4 md:p-5">
      <div className="vyron-section-label">Recoverable Annual Profit</div>
      <div className="mt-1 text-[3.25rem] font-black leading-none tracking-tight text-[#0F172A] md:text-[4.5rem] lg:text-[5rem]">
        {formatCompactAnnual(kpis.recoverableAnnual)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E2E8F0] pt-3">
        <div className="rounded-lg border border-[#FEE2E2] bg-[#FEF2F2] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#EF4444]">Money Being Lost</div>
          <div className="text-lg font-black text-[#EF4444]">{formatExecutiveMoney(kpis.moneyAtRisk)}<span className="ml-1 text-[10px] font-bold text-[#64748B]">/mo</span></div>
        </div>
        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#64748B]">Monthly Leakage</div>
          <div className="text-sm font-black text-[#0F172A]">{formatExecutiveMoney(kpis.estimatedMonthlyLeakage)}</div>
        </div>
        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#64748B]">Recovery Rate</div>
          <div className="text-sm font-black text-[#9333EA]">{kpis.recoveryRatePercent}%</div>
        </div>
        <Link href="/recovery-opportunities" className="ml-auto rounded-lg bg-[#A78BFA] px-3 py-2 text-[11px] font-black text-[#0F172A]">
          View Recovery
        </Link>
      </div>
    </VyronSurfaceCard>
  );
}
