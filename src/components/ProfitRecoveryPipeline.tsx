import VyronSurfaceCard, { formatCompactAnnual } from "@/components/VyronSurfaceCard";
import { LeakageKpis } from "@/lib/vyron-financial-command-data";

function buildPipeline(kpis: LeakageKpis) {
  const recoverable = kpis.recoverableAnnual;
  const leakage = kpis.estimatedAnnualLeakage;
  const wastage = kpis.wastageLosses * 12;
  const packaging = kpis.procurementAnomalies * 12;
  const foodCost = Math.max(Math.round(kpis.productsBelowGp * 12 * 0.55), Math.round(leakage * 0.28));
  const labour = Math.round(leakage * 0.14);
  const revenue = recoverable + leakage + foodCost + packaging + labour + wastage;

  return [
    { label: "Revenue", value: revenue, color: "#0F172A", bg: "#F1F5F9" },
    { label: "Food Cost", value: foodCost, color: "#64748B", bg: "#F8FAFC" },
    { label: "Packaging", value: packaging, color: "#475569", bg: "#F8FAFC" },
    { label: "Labour", value: labour, color: "#64748B", bg: "#F8FAFC" },
    { label: "Wastage", value: wastage, color: "#C026D3", bg: "#FFFBEB" },
    { label: "Leakage", value: leakage, color: "#EF4444", bg: "#FEF2F2" },
    { label: "Recoverable Profit", value: recoverable, color: "#9333EA", bg: "#F0FDF4" },
  ];
}

export default function ProfitRecoveryPipeline({ kpis }: { kpis: LeakageKpis }) {
  const steps = buildPipeline(kpis);

  return (
    <section id="recovery-pipeline">
      <div className="mb-2 vyron-section-label">Profit Recovery Pipeline</div>
      <VyronSurfaceCard elevated className="overflow-x-auto p-3">
        <div className="flex min-w-[920px] items-stretch gap-1">
          {steps.map((step, index) => (
            <div key={step.label} className="flex flex-1 items-center gap-1">
              <div className="flex min-h-[72px] flex-1 flex-col justify-center rounded-xl border border-[#E2E8F0] px-2 py-2" style={{ backgroundColor: step.bg }}>
                <div className="text-[8px] font-black uppercase tracking-[0.1em] text-[#64748B]">{step.label}</div>
                <div className="mt-1 text-sm font-black leading-none" style={{ color: step.color }}>
                  {formatCompactAnnual(step.value)}
                </div>
              </div>
              {index < steps.length - 1 ? <span className="shrink-0 text-sm font-black text-[#CBD5E1]">→</span> : null}
            </div>
          ))}
        </div>
      </VyronSurfaceCard>
    </section>
  );
}
