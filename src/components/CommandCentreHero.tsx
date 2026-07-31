import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import VyronPremiumCard from "@/components/VyronPremiumCard";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

function formatHeroMoney(value: number) {
  return `R${Math.round(value || 0)
    .toLocaleString("en-ZA")
    .replace(/,/g, " ")}`;
}

function formatAnnualCompact(value: number) {
  const v = Number(value || 0);
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `R${m >= 10 ? Math.round(m) : m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (v >= 1_000) return `R${Math.round(v / 1000)}k`;
  return formatHeroMoney(v);
}

export default function CommandCentreHero({
  kpis,
  activeRisks,
  productsUnderPressure,
}: {
  kpis: LeakageKpis;
  activeRisks: number;
  productsUnderPressure: number;
}) {
  return (
    <section className="relative mb-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <VyronPremiumCard className="overflow-hidden p-8 md:p-10 lg:p-12" glow>
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#A78BFA]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-[#1f4b38]/60 blur-3xl" />

          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#DDD6FE]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#A78BFA] shadow-[0_0_12px_#A78BFA]" />
              Live Intelligence
            </div>

            <h1 className="max-w-3xl text-3xl font-black leading-[1.08] tracking-tight text-white md:text-4xl lg:text-[2.75rem]">
              Financial Intelligence Command Centre
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 md:text-lg">
              Real-time visibility into profitability, supplier risk, procurement leakage and financial recovery
              opportunities.
            </p>

            <div className="mt-10 border-t border-white/10 pt-10">
              <div className="text-[11px] font-black uppercase tracking-[0.32em] text-[#ef4444]">Money At Risk</div>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div className="vyron-text-glow text-6xl font-black leading-none tracking-tight text-white md:text-7xl lg:text-8xl">
                  {formatHeroMoney(kpis.moneyAtRisk)}
                </div>
                <div className="pb-2 text-lg font-black uppercase tracking-[0.2em] text-white/40">per month</div>
              </div>
            </div>
          </div>
        </VyronPremiumCard>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <VyronPremiumCard className="p-6 vyron-glow-lime xl:col-span-1">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#DDD6FE]">Recoverable Profit</div>
            <div className="mt-3 text-5xl font-black tracking-tight text-[#DDD6FE] md:text-6xl">
              {formatAnnualCompact(kpis.recoverableAnnual)}
            </div>
            <div className="mt-2 text-sm font-black uppercase tracking-[0.18em] text-white/45">per year</div>
            <Link
              href="/recovery-opportunities"
              className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#DDD6FE] hover:text-white"
            >
              View recovery
              <ArrowUpRight size={14} />
            </Link>
          </VyronPremiumCard>

          <VyronPremiumCard className="p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">Active Risks</div>
            <div className="mt-3 text-5xl font-black text-white">{activeRisks}</div>
            <div className="mt-2 text-xs font-bold text-[#c026d3]">Requires executive attention</div>
          </VyronPremiumCard>

          <VyronPremiumCard className="p-6 sm:col-span-2 xl:col-span-1">
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">Products Under Pressure</div>
            <div className="mt-3 text-5xl font-black text-white">{productsUnderPressure}</div>
            <Link
              href="/product-profitability"
              className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/50 hover:text-[#DDD6FE]"
            >
              Margin intelligence
              <ArrowUpRight size={14} />
            </Link>
          </VyronPremiumCard>
        </div>
      </div>
    </section>
  );
}
