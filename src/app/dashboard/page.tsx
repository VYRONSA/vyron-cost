import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import VyronCostAiShell from "@/components/VyronCostAiShell";
import {
  getPhase4RecoveryInsights,
  getProcurementRiskAlerts,
  getSupplierPriceWidgetSummary,
} from "@/lib/vyron-supplier-intelligence-engine";

export default async function DashboardPage() {
  const [widgets, recoveryInsights, risks] = await Promise.all([
    getSupplierPriceWidgetSummary(),
    getPhase4RecoveryInsights(),
    getProcurementRiskAlerts(),
  ]);
  const topRecovery = recoveryInsights[0];
  return (
    <VyronCostAiShell
      title="Handcrafted Foods Profit Command Centre"
      subtitle="AI Costing • Recovery Intelligence • Supplier Intelligence • Margin Protection"
    >
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] bg-white p-8 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-600">
            Executive Overview
          </div>

          <h1 className="mt-3 text-5xl font-black leading-tight text-slate-950">
            Protect Profit.
            <br />
            Recover Margin.
          </h1>

          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
            Monitor costing, supplier movement, product profitability and recovery opportunities from one premium command centre.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              ["Recovery", "R187,500", "Annual opportunity", "bg-violet-50 text-violet-700"],
              ["GP Average", "42.8%", "Current margin", "bg-emerald-50 text-emerald-700"],
              ["At Risk", String(risks.length), "Procurement risks open", "bg-amber-50 text-amber-700"],
              ["Suppliers", String(widgets.suppliersWithMostChanges.length), "Suppliers with movement", "bg-blue-50 text-blue-700"],
            ].map(([label, value, note, tone]) => (
              <div key={label} className={`rounded-3xl p-5 ${tone}`}>
                <div className="text-xs font-black uppercase tracking-[0.12em] opacity-70">{label}</div>
                <div className="mt-2 text-3xl font-black">{value}</div>
                <p className="mt-1 text-xs font-bold opacity-70">{note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-indigo-700 p-8 text-white shadow-[0_18px_50px_rgba(81,63,190,0.25)]">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-emerald-300/20 blur-2xl" />

          <div className="relative">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-violet-100">
              Profit Protection Engine
            </div>

            <div className="mt-8 grid gap-4">
              {[
                ["🥩", "Ingredient Costs", "Raw material movement and true unit cost"],
                ["📦", "Packaging Costs", "Boxes, labels, foil and product packaging"],
                ["👨‍🍳", "Labour & Overheads", "Production cost and operational load"],
                ["🤖", "AI Recovery Engine", "Recoverable leakage and pricing actions"],
              ].map(([emoji, title, desc]) => (
                <div key={title} className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{emoji}</div>
                    <div>
                      <div className="font-black">{title}</div>
                      <div className="text-xs font-semibold text-violet-100">{desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/financial-leakage"
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-950"
            >
              Open Recovery Centre <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <TrendingUp className="text-emerald-600" size={30} />
          <h2 className="mt-4 text-2xl font-black text-slate-950">Product Profitability</h2>
          <div className="mt-5 space-y-3 text-sm font-bold text-slate-600">
            <div className="flex justify-between rounded-2xl bg-emerald-50 px-4 py-3"><span>Pepper Steak Pie</span><span className="text-emerald-700">73%</span></div>
            <div className="flex justify-between rounded-2xl bg-emerald-50 px-4 py-3"><span>Chicken Pie</span><span className="text-emerald-700">61%</span></div>
            <div className="flex justify-between rounded-2xl bg-amber-50 px-4 py-3"><span>Karoo Lamb Pie</span><span className="text-amber-700">40%</span></div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <ShieldAlert className="text-red-600" size={30} />
          <h2 className="mt-4 text-2xl font-black text-slate-950">Recovery Opportunities</h2>
          <div className="mt-5 space-y-3 text-sm font-bold text-slate-600">
            <div className="flex justify-between rounded-2xl bg-red-50 px-4 py-3"><span>Packaging Waste</span><span className="text-red-700">R42,000</span></div>
            <div className="flex justify-between rounded-2xl bg-red-50 px-4 py-3"><span>Supplier Inflation</span><span className="text-red-700">R31,000</span></div>
            <div className="flex justify-between rounded-2xl bg-red-50 px-4 py-3"><span>Recipe Leakage</span><span className="text-red-700">R18,000</span></div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <Users className="text-blue-600" size={30} />
          <h2 className="mt-4 text-2xl font-black text-slate-950">Supplier Intelligence</h2>
          <div className="mt-5 space-y-3 text-sm font-bold text-slate-600">
            <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3"><span>BASIC FOODS</span><span className="text-red-600">▲ 8%</span></div>
            <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3"><span>PACKIT</span><span className="text-red-600">▲ 12%</span></div>
            <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3"><span>MEAT WORLD</span><span className="text-emerald-600">▼ 2%</span></div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] bg-slate-950 p-8 text-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
        <BrainCircuit size={36} className="text-violet-300" />
        <h2 className="mt-4 text-3xl font-black">AI Insights</h2>
        <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-300 md:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4">
            Price increases this month: {widgets.increasesThisMonth}, decreases: {widgets.decreasesThisMonth}
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            {widgets.highestIncrease
              ? `${widgets.highestIncrease.supplierName} highest increase ${widgets.highestIncrease.percentageChange.toFixed(1)}%`
              : "No significant supplier increase detected"}
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            {topRecovery
              ? `Top recovery: ${topRecovery.title} · R${topRecovery.monthlyRecovery.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}/month`
              : "Recovery intelligence will appear after approved invoice updates"}
          </div>
        </div>
      </section>
    </VyronCostAiShell>
  );
}
