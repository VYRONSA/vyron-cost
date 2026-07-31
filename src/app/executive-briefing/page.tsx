import Link from "next/link";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import { getRecoveryOpportunities, money } from "@/lib/vyron-cost-recovery-data";

export default async function ExecutiveBriefingPage() {
  const opportunities = await getRecoveryOpportunities();
  const annual = opportunities.reduce((sum, item) => sum + Number(item.annual_value || 0), 0);
  const monthly = opportunities.reduce((sum, item) => sum + Number(item.monthly_value || 0), 0);

  return (
    <VyronCostAiShell hidePageHeader title="Executive Briefing"
      subtitle="Boardroom-ready summary of margin leakage, supplier risk and recovery opportunities."
    >
      <section className="grid gap-5 md:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Annual Recovery</div>
          <div className="mt-3 text-4xl font-black text-[#84CC16]">{money(annual)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Monthly Recovery</div>
          <div className="mt-3 text-4xl font-black text-violet-700">{money(monthly)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Open Actions</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{opportunities.length}</div>
        </div>
        <div className="rounded-[2rem] bg-[#A855F7]/10 p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-[#84CC16]">Priority</div>
          <div className="mt-3 text-3xl font-black text-[#84CC16]">Recover</div>
        </div>
      </section>

      <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <h2 className="text-xl font-black text-slate-900">Top Executive Actions</h2>
        <div className="mt-5 grid gap-4">
          {opportunities.slice(0, 5).map((item) => (
            <Link
              key={item.id}
              href={`/recovery-opportunities/${item.id}`}
              className="rounded-3xl bg-slate-50 p-5 transition hover:bg-violet-50"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-slate-900">{item.title}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{item.recommended_action}</div>
                </div>
                <div className="text-2xl font-black text-[#84CC16]">{money(item.annual_value)}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </VyronCostAiShell>
  );
}
