import Link from "next/link";
import VyronSurfaceCard, { formatCompactAnnual } from "@/components/VyronSurfaceCard";
import type { RecoveryOpportunity } from "@/lib/vyron-demo-data";

const displayNames: Record<string, string> = {
  "Reprice below-target GP products": "Price Optimisation",
  "Negotiate protein & packaging suppliers": "Supplier Negotiation",
  "Production yield improvements": "Recipe Optimisation",
  "Reduce packaging cost on top SKUs": "Packaging Optimisation",
};

const preferredOrder = ["Supplier Negotiation", "Recipe Optimisation", "Price Optimisation"];

function confidenceFromDifficulty(difficulty: string) {
  const value = difficulty.toLowerCase();
  if (value.includes("low")) return { label: "High", percent: 92 };
  if (value.includes("medium")) return { label: "Medium", percent: 78 };
  return { label: "Moderate", percent: 64 };
}

function sortOpportunities(opportunities: RecoveryOpportunity[]) {
  return [...opportunities].sort((a, b) => {
    const aName = displayNames[a.opportunity] || a.opportunity;
    const bName = displayNames[b.opportunity] || b.opportunity;
    return preferredOrder.indexOf(aName) - preferredOrder.indexOf(bName);
  });
}

export default function RecoveryOpportunityShowcase({ opportunities }: { opportunities: RecoveryOpportunity[] }) {
  const cards = sortOpportunities(opportunities).slice(0, 3);

  return (
    <section id="recovery-opportunities">
      <div className="mb-2 flex items-center justify-between">
        <div className="vyron-section-label">Recovery Opportunities</div>
        <Link href="/recovery-opportunities" className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">View all →</Link>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {cards.map((item) => {
          const confidence = confidenceFromDifficulty(item.difficulty);
          const title = displayNames[item.opportunity] || item.opportunity;
          return (
            <VyronSurfaceCard key={item.id} elevated className="flex flex-col p-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#64748B]">Opportunity</div>
              <h3 className="mt-1 text-sm font-black text-[#0F172A]">{title}</h3>
              <div className="mt-2">
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Potential Recovery</div>
                <div className="text-2xl font-black text-[#9333EA]">{formatCompactAnnual(item.annual_saving)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2 py-1.5 text-[10px]">
                <span className="font-black text-[#64748B]">Confidence {confidence.label} · {confidence.percent}%</span>
              </div>
              <Link href={`/recovery-opportunities/${item.id}`} className="mt-2 rounded-lg vyron-grad-deep py-2 text-center text-[11px] font-black text-white">
                {item.action}
              </Link>
            </VyronSurfaceCard>
          );
        })}
      </div>
    </section>
  );
}
