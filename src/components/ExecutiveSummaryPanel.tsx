import Link from "next/link";
import VyronSurfaceCard, { formatCompactAnnual } from "@/components/VyronSurfaceCard";
import { AiFinancialFeedItem, LeakageKpis } from "@/lib/vyron-financial-command-data";
import type { RecoveryOpportunity } from "@/lib/vyron-demo-data";

const opportunityLabels: Record<string, string> = {
  "Reprice below-target GP products": "Price Optimisation",
  "Negotiate protein & packaging suppliers": "Supplier Negotiation",
  "Production yield improvements": "Recipe Optimisation",
  "Reduce packaging cost on top SKUs": "Packaging Optimisation",
};

function profitProtectionScore(kpis: LeakageKpis) {
  return Math.round(Math.min(94, Math.max(52, kpis.recoveryRatePercent + 12)));
}

export default function ExecutiveSummaryPanel({
  kpis,
  feed,
  recovery,
}: {
  kpis: LeakageKpis;
  feed: AiFinancialFeedItem[];
  recovery: RecoveryOpportunity[];
}) {
  const score = profitProtectionScore(kpis);
  const highestRisk = feed.find((f) => /critical|high/i.test(f.severity))?.headline || "Supplier inflation";
  const highestOpportunity = opportunityLabels[recovery[0]?.opportunity || ""] || "Price Optimisation";

  const rows = [
    { label: "Profit Protection Score", value: `${score}/100`, tone: score >= 70 ? "text-[#22C55E]" : "text-[#F59E0B]" },
    { label: "Highest Risk", value: highestRisk, tone: "text-[#EF4444]" },
    { label: "Highest Opportunity", value: highestOpportunity, tone: "text-[#0F172A]" },
    { label: "Recoverable Value", value: formatCompactAnnual(kpis.recoverableAnnual), tone: "text-[#22C55E]" },
    { label: "Management Actions Required", value: String(kpis.pendingActions), tone: "text-[#F59E0B]" },
  ];

  return (
    <VyronSurfaceCard elevated className="flex h-full flex-col p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="vyron-section-label">Executive Summary</div>
        <Link href="/action-centre" className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B] hover:text-[#0F172A]">
          Actions →
        </Link>
      </div>
      <div className="grid flex-1 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{row.label}</div>
            <div className={`mt-0.5 truncate text-xs font-black ${row.tone}`}>{row.value}</div>
          </div>
        ))}
      </div>
    </VyronSurfaceCard>
  );
}
