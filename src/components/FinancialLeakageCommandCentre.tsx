import AiIntelligenceWall from "@/components/AiIntelligenceWall";
import DashboardStatusBar from "@/components/DashboardStatusBar";
import ExecutiveSummaryPanel from "@/components/ExecutiveSummaryPanel";
import ProfitProtectionHero from "@/components/ProfitProtectionHero";
import ProfitRecoveryPipeline from "@/components/ProfitRecoveryPipeline";
import RecoveryOpportunityShowcase from "@/components/RecoveryOpportunityShowcase";
import ThreatCentrePanel from "@/components/ThreatCentrePanel";
import { AiFinancialFeedItem, LeakageKpis } from "@/lib/vyron-financial-command-data";
import type { RecoveryOpportunity } from "@/lib/vyron-demo-data";

export default function FinancialLeakageCommandCentre({
  kpis,
  feed,
  recovery,
}: {
  kpis: LeakageKpis;
  feed: AiFinancialFeedItem[];
  recovery: RecoveryOpportunity[];
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <header className="shrink-0 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-black uppercase tracking-[0.06em] text-[#0F172A] md:text-xl">
            Profit Protection Command Centre
          </h1>
          <p className="mt-1 text-xs leading-5 text-[#64748B] md:text-sm">
            AI-powered visibility into margin erosion, supplier inflation, procurement leakage and profit recovery opportunities.
          </p>
        </div>
        <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">
          Handcrafted Food Products · Live
        </div>
      </header>

      <section className="grid shrink-0 gap-3 lg:grid-cols-[1.45fr_0.55fr]">
        <ProfitProtectionHero kpis={kpis} />
        <ExecutiveSummaryPanel kpis={kpis} feed={feed} recovery={recovery} />
      </section>

      <AiIntelligenceWall kpis={kpis} feed={feed} />
      <RecoveryOpportunityShowcase opportunities={recovery} />
      <ProfitRecoveryPipeline kpis={kpis} />
      <ThreatCentrePanel kpis={kpis} />
      <DashboardStatusBar kpis={kpis} />
    </div>
  );
}
